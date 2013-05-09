"use strict";

var
	events		= require('events'),
	util		= require('util'),
	net		= require('net'),
	Stream		= require('./stream').stream.Stream,

	MAXRETRIES	= 10,
	CON_RETRYTIME	= 2000,
	DEBUG		= false;


// A client

function Client(opts) {

	// Options

	if ( opts == null )
		opts = {};

	// Variable properties

	this.host = opts.host || "127.0.0.1";
	this.port = opts.port || 1917;

	// Fixed properties

	this.connected = false;
	this.retries = 0;
	this.stream = null;

	this.waitingConnect = [];
	this.pendingPushAnswers = [];

	this.works = { };
	this.worksByRequest = { };
	this.requestHandler = { },
	this.requestResults = { };
	this.requestResultCounter = { };
	this.requestAnswers = { };
	this.requestWorkPos = { };

	// Methods

	this.work = clientWork;
	this._clientConnect = _clientConnect;
	this._waitConnection = _clientWaitConnection;
	this._clientRegisterWork = _clientRegisterWork;
	this._clientNewRequestID = _clientNewRequestID;
	this._clientOnMessage = _clientOnMessage;
	this._clientOnError = _clientOnError;
	this._clientOnDisconnect = _clientOnDisconnect;
	this._clientRequestWorkDone = _clientRequestWorkDone;
	this._send = _send;
	this._command = _command;

	// Debug

	DEBUG = opts.DEBUG || false;

	// Connect please!

	this._clientConnect();

}
util.inherits(Client, events.EventEmitter);


// Connect

function _clientConnect() {

	var
		self = this;

	this.connected = false;
	this.retries = 0;
	self.s = net.connect({host: self.host, port: self.port}, function(){
		_debug("[client] Connected to comrade manager");
		self.connected = true;
		self.stream = new Stream("string",self.s);
		self.stream.on('message',function(m){ self._clientOnMessage(m)   });
		self.stream.on('error',function(err){ self._clientOnError(err)   });
		self.stream.on('close',function(){    self._clientOnDisconnect() });
		self.emit('connect',null);
	});
	self.s.on('connect',function(){
		while ( self.waitingConnect.length > 0 ) {
			var
				handler = self.waitingConnect.shift();

			handler();
		}
	});
	self.s.on('error',function(err){
		if ( err.code ) {
			if ( err.code == "ECONNREFUSED" ) {
				_debug("Could not connect to manager. Retrying in "+CON_RETRYTIME+"ms...");

				if ( self.retries++ < MAXRETRIES ) {
					return setTimeout(function(){
						return self._clientConnect();
					}, CON_RETRYTIME);
				}
				else
					self.emit('connect',err);
			}
		}
		else {
			_debug("[client] No error code, ignoring by logging: "+err.toString());
		}
	})

}


// Wait for connection

function _clientWaitConnection(handler) {

	if ( this.connected )
		return handler();

	return this.waitingConnect.push(handler);

}


// On message

function _clientOnMessage(msg) {

	var
		self = this,
		m;

	try {
		m = JSON.parse(msg.toString('utf8'));
	}
	catch(ex) {
		_debug("[client] Is comrade manager drunk or what? Got invalid JSON. Ignoring message: ",ex);
		return;
	}

	// Answer to my requests

	if ( m.command == "answer" ) {

		if ( m.to == "push" ) {

			if ( self.pendingPushAnswers.length == 0 ) {
				_debug("[client] Comrade manager is answering me to push but i didn't send any push, ignoring...");
				return;
			}

			var
				handler = self.pendingPushAnswers.shift();


			if ( m.error ) {
				_debug("[client #"+self.id+"] Comrade manager answered with error: ",m.error);
				return handler(err);
			}

			if ( !(m.work instanceof Array) || m.work.length == 0 )
				return handler(new Error("Got no work IDs"),null);

			// Register on all indexes

			self._clientRegisterWork(m.work,handler);

			_debug("[client] Comrade manager accepted my work! A glass of vodka for that!");
		}
		else {
			_debug("[client] Answer to something that I don't know");
		}
		return;
	}

	// Work push ?

	else if ( m.command == "done" ) {
		_debug("Done");
		if ( !(m.work instanceof Array) || m.work.length == 0 )
			return handler(new Error("Got no works on 'done' answer"),null);

		var
			reqs = {};

		m.work.forEach(function(aw){
			var
				w = self.works[aw.id||''];

			if ( w ) {
				self.requestResults[w.request].push(aw);
				reqs[w.request] = true;
			}
		});


		// Notify

		for ( var req in reqs ) {
			if ( self.requestResults[req].length >= self.worksByRequest[req].length ) {
				_debug("Request #"+req+" reached the number of works: "+self.requestResults[req].length);
				self._clientRequestWorkDone(req,self.requestResults[req]);
			}
		}

	}

}

// Register work

function _clientRegisterWork(items,handler) {

	// Get new ID

	var
		self = this,
		requestID = this._clientNewRequestID(),
		x = 0;

	self.worksByRequest[requestID] = items;
	items.forEach(function(id){
		self.works[id] = {
			id: id,
			pushed: new Date(),
			request: requestID
		};
		self.requestWorkPos[id] = x++;
	});

	self.requestHandler[requestID] = handler;
	self.requestResults[requestID] = [ ];

}

// Generate new clint ID

function _clientNewRequestID() {

	var
		d = new Date().getTime().toString(),
		id;

	do {
		id = "R"+d.substr(d.length-6,6) + "r" + Math.floor(Math.random()*1001);
	} while ( this.requestHandler[id] != null );

	return id;

}

// Client work is done

function _clientRequestWorkDone(req,works) {

	var
		self = this,
		results = [];

	_debug("Request #"+req+" seems complete ("+self.requestResults[req].length+" vs "+self.worksByRequest[req].length+")!");

	// Register completed works by request

	works.forEach(function(aw){

		var
			w = self.works[aw.id];

		results[self.requestWorkPos[w.id]] = aw.result;

	});

	_debug("Request #"+req+" is complete!");

	// Run the request handler

	if ( results.length > 1 )
		self.requestHandler[req](null,results,results);
	else
		self.requestHandler[req](results[0].err,results[0].data,self.works[works[0]]);

	// Cleanup



	return;

}


// On error

function _clientOnError() { }

// On disconnect

function _clientOnDisconnect() {

	return this._clientConnect();

}



// Run work

function clientWork(args,handler) {

	var
		self = this,
		items = (args instanceof Array) ? args : [args],
		_items = [];

	// Check all items

	items.forEach(function(i){
		if ( typeof(i) == "function" )
			return _items.push({ _Fn: true, _code: i.toString('utf8') });
		_items.push(i);
	});

	// Wait for connection and do the things

	return this._waitConnection(function(err,connected){
		if ( err )
			return handler(err,null);

		self.pendingPushAnswers.push(handler);
		return self._command("push",{work: _items});
	});

}


// Tell things to a manager

function _send(obj) {
	if ( !this.connected )
		return;

	return this.stream.sendMessage(JSON.stringify(obj));
}
function _command(command,args) {
	var
		o = args || { };

	o.command = command;
	this._send(o);
}

// Debug

function _debug() {

	if ( !DEBUG )
		return;

	var
		args = [_nsec([])];

	for ( var x = 0 ; x < arguments.length ; x++ )
		args.push(arguments[x]);

	console.log.apply(null,args);

}

function _nsec(start) {

	var
		diff = process.hrtime(start);

	return (diff[0] * 1e9 + diff[1]) / 1000000;

}

// Self object

exports.Client = Client;
