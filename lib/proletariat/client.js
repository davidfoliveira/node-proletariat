"use strict";

var
	events			= require('events'),
	util			= require('util'),
	net				= require('net'),
	MessageStream	= require('../messagestream'),

	CON_RETRYTIME	= 2000,
	DEBUG			= false;


// A server object
function ServerConnection(host,port,idx,client) {

	this.idx			= idx;
	this.client			= client
	this.address		= host+":"+port;
	this.host			= host;
	this.port			= port;
	this.socket			= null;
	this.stream			= null;
	this.active			= false;
	this.connecting		= false;
	this.connected		= false;
	this.retries		= 0;
	this.status			= null;
	this.sentJobs		= false;
	this.recvTimeout	= null;
	this.timeouts		= [];

	// Connect!
	this.connect();

}
util.inherits(ServerConnection, events.EventEmitter);

// Write a debug message
ServerConnection.prototype._debug = function() {

	var
		args = Array.prototype.slice.call(arguments, 0);

	_debug.apply(null,["[server "+this.address+"]"].concat(args));

};

// Connect to server
ServerConnection.prototype.connect = function() {

	var
		self = this;

	self.socket = net.connect({host: self.host, port: self.port}, function(){
		self._debug("Connected to manager "+self.address);
		self.active = true;
		self.connecting = false;
		self.connected = true;
		self.retries = 0;
		self.stream = new MessageStream(self.socket,{format:"string"});
		self.stream.on('message',function(m){	self.onMessage(m);		});
		self.stream.on('error',function(err){	self.onError(err);		});
		self.stream.on('close',function(){		self.onDisconnect();	});
		self.stream.on('end',function(){		self.onDisconnect();	});
		self.emit('connect',self);

		self.status = "wait-hello";
		self.recvTimeout = self.setTimeout(function(){
			self._debug("Timeout while waiting for server hello");
			self.disconnect();
		},2000);
	});
	self.socket.on('connect',function(){
		self._debug("Connected to manager!");
	});
	self.socket.on('error',function(err){
		self._debug("Connection error: ",err);

		if ( self.connecting ) {
			var
				retryIn = self.client.opts.waitRetry || 1000;

			self._debug("Retrying connecting in "+retryIn+" ms");
			setTimeout(function(){
				self.connect();
			},retryIn);
		}
	});

};

// Disconnect from server
ServerConnection.prototype.disconnect = function() {

	var
		self = this;

	this._debug("Disconnecting!");

	// Clear all the timeouts
	self.cancelTimeouts();

	// Just destroy the socket
	this.active = false;
	this.connected = false;
	this.socket.destroy();

};

// Disconnect/Connect to a server
ServerConnection.prototype.reconnect = function() {

	var
		self = this;

	this._debug("Reconnecting...");

	// Clear all the timeouts
	while ( self.timeouts.length > 0 ) {
		clearTimeout(self.timeouts.shift());
	}

	// Just destroy the socket
	this.connecting = true;
	this.connected = false;
	this.socket.destroy();
	if ( this.active ) {
		this.connect();
	}

};

// Set a timeout
ServerConnection.prototype.setTimeout = function(callback,time) {

	var
		self = this,
		timeout;

	timeout = setTimeout(callback,time);
	self.timeouts.push(timeout);

	return timeout;

};

// Cancel all timeouts
ServerConnection.prototype.cancelTimeouts = function(){

	var
		self = this;

	while ( self.timeouts.length > 0 ) {
		clearTimeout(self.timeouts.shift());
	}	

};

// Send a message
ServerConnection.prototype.send = function(m) {

	if ( !this.connected ) {
		this._debug("Trying to send messages to a disconnected server... discarding...");
		return;
	}

	return this.stream.sendMessage(JSON.stringify(m));

};


// Received a message from server
ServerConnection.prototype.onMessage = function(msg) {

	var
		self = this,
		m;

	// Parse message
	try {
		m = JSON.parse(msg.toString('utf8'));
	}
	catch(ex) {
		self._debug("Is comrade manager "+self.address+" drunk or what? Got invalid JSON. Ignoring message: ",ex);
		return;
	}


	// Handle message by type
	if ( m.c === "hello" ) {
		if ( self.status !== "wait-hello" ) {
			self._debug("Manager sent me an hello message but I was not expecting that. Restarting connection...");
			return self.reconnect();
		}

		// Is it from a compatible version?
		if ( !m.proto_v || m.proto_v !== "1.0" ) {
			self._debug("Manager runs an incompatible protocol version. I can't use this server.");
			return self.disconnect();
		}

		// Got hello!
		clearTimeout(self.recvTimeout);
		self.status = "sent-hello";
		self._debug("Got an hello from manager. Yey! Sending greetings!");
		this.send({c:"hello",id:self.client.id});
	}
	else if ( m.c === "ping" ) {
		self._debug("Got a ping, answering with pong!");
		this.send({c:"answer",to:"ping"});
	}
	else {
		self._debug("Got a weird message from manager "+self.address+": ",m);
	}

};

// Got disconnected
ServerConnection.prototype.onDisconnect = function() {

	var
		self = this;

	this._debug("Server has disconnected. Reconnecting!");
	self.reconnect();

};


// A client object
function Client(opts) {

	// Options
	if ( opts == null )
		opts = {};
	else if ( typeof(opts) == "string" )
		opts = { host: opts };

	// Variable properties
	this.opts				= opts;
	this.id					= opts.id			|| null;
	this.host				= opts.host			|| "127.0.0.1";
	this.port				= opts.port			|| 1917;
	this.serverAddrs		= opts.servers		|| [opts.host+":"+opts.port];
	this.MAXRETRIES			= opts.MAXRETRIES	|| null;

	// Fixed properties
	this.servers			= [];

	// Debug
	DEBUG = opts.DEBUG || false;

	// Connect please!
	this.connect();

}
util.inherits(Client, events.EventEmitter);


// Connect to all servers
Client.prototype.connect = function() {

	var
		self	= this,
		idx		= 0;

	// Connect to each server
	self.serverAddrs.forEach(function(addr){
		if ( !addr || !addr.match(/^(.+):(\d+)$/) )
			return;

		self.servers.push(new ServerConnection(RegExp.$1,RegExp.$2,idx++,self));
	});

};



// Debug
function _debug() {

	if ( !DEBUG )
		return;

	var
		args = Array.prototype.slice.call(arguments, 0);

	args.unshift(_nsec([]).toString());
	console.log.apply(null,args);

}

function _nsec(start) {

	var
		diff = process.hrtime(start);

	return (diff[0] * 1e9 + diff[1]) / 1000000;

}

// Self object
exports.Client = Client;
