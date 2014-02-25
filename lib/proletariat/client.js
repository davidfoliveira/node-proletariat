"use strict";

var
	events		= require('events'),
	util		= require('util'),
	net		= require('net'),
	Stream		= require('./stream').stream.Stream,

	CON_RETRYTIME	= 2000,
	DEBUG		= false;


// A client

function Client(opts) {

	// Options
	if ( opts == null )
		opts = {};
	else if ( typeof(opts) == "string" )
		opts = { host: opts };

	// Variable properties
	this.host			= opts.host		|| "127.0.0.1";
	this.port			= opts.port		|| 1917;
	this.MAXRETRIES			= opts.MAXRETRIES	|| null;
	this.keepState			= opts.keepState	|| null;

	// Fixed properties
	this.connected			= false;
	this.retries			= 0;
	this.stream			= null;
	this.sentSomething		= false;

	this.waitingConnect		= [];

	this.requestItems		= { };
	this.requestOpts		= { };
	this.requestHandlers		= { };
	this.requestWorks		= { };
	this.requestResults		= { };
	this.requestResent		= { };
	this.sysMessages		= { };
	this.works			= { };
	this.worksRequestPos		= { };
	this.worksWithoutAnswer		= { };


	// Methods
	this.systemMessage		= systemMessage;
	this.work			= clientWork;
	this.workIndividual		= clientWorkIndividual;
	this._clientConnect		= _clientConnect;
	this._waitConnection		= _clientWaitConnection;
	this._clientAbortConWaiter	= _clientAbortConWaiter;
	this._clientRegisterWork	= _clientRegisterWork;
	this._clientRegisterResentWork	= _clientRegisterResentWork;
	this._clientNewRequestID	= _clientNewRequestID;
	this._clientOnMessage		= _clientOnMessage;
	this._clientOnError		= _clientOnError;
	this._clientOnDisconnect	= _clientOnDisconnect;
	this._clientRequestWorkDone	= _clientRequestWorkDone;
	this._clientRequestAnswer	= _clientRequestAnswer;
	this._clientRequestAbort	= _clientRequestAbort;
	this._clientResentUnfinished	= _clientResentUnfinished;
	this._sysMessageNewID		= _sysMessageNewID;
	this._send			= _send;
	this._command			= _command;

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
	self.s = net.connect({host: self.host, port: self.port}, function(){
		_debug("[client] Connected to comrade manager");
		self.connected = true;
		self.retries = 0;
		self.stream = new Stream("string",self.s);
		self.stream.on('message',function(m){ self._clientOnMessage(m)   });
		self.stream.on('error',function(err){ self._clientOnError(err)   });
		self.stream.on('close',function(){    self._clientOnDisconnect() });
		self.stream.on('end',function(){    self._clientOnDisconnect() });
		self.emit('connect',null);
		if ( self.sentSomething ) {
			self._clientResentUnfinished();
		}
	});
	self.s.on('connect',function(){
		while ( self.waitingConnect.length > 0 ) {
			var
				handler = self.waitingConnect.shift();

			handler();
		}
	});
	self.s.on('error',function(err){
		_debug("Connecting error: ",err);
		if ( err.code ) {
			if ( err.code == "ECONNREFUSED" ) {
				_debug("Could not connect to manager. Retrying (#"+self.retries+") in "+CON_RETRYTIME+"ms...");

				self.retries++;
				if ( self.MAXRETRIES == null || self.retries <= self.MAXRETRIES ) {
					return setTimeout(function(){
						return self._clientConnect();
					}, CON_RETRYTIME);
				}
				else {
					_debug("Reached connection retry limit ("+self.MAXRETRIES+"). Giving up...");
					self.emit('connect',err);
				}
			}
		}
		else {
			_debug("[client] No error code, ignoring by logging: "+err.toString());
		}
	})

}


// Wait for connection
function _clientWaitConnection(handler,requestID) {

	if ( this.connected )
		return handler();

	return this.waitingConnect.push({cb: handler, id: requestID});

}


// Abort connection waiter with a specific ID
function _clientAbortConWaiter(requestID) {

	for ( var x = 0 ; x < this.waitingConnect.length ; x++ ) {
		if ( this.waitingConnect[x] && this.waitingConnect[x].id == requestID ) {
			this.waitingConnect.splice(x,1);
			x--;
		}
	}

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

			if ( !m.rid ) {
				_debug("[client] Got no group ID on 'push' answer from manager. Ignoring...");
				return;
			}
			if ( !self.requestHandlers[m.rid] || !self.requestItems[m.rid] ) {
				_debug("[client] Got a push answer for a group that i have not record about. Ignoring...");
				return;
			}

			var
				handlers = self.requestHandlers[m.rid];

			// Message without work ?
			if ( !(m.work instanceof Array) || m.work.length == 0 )
				return handlers.group(new Error("Got no work IDs"),null);

			// Some error ?
			if ( m.error ) {
				_debug("[client #"+self.id+"] Comrade manager answered with error: ",m.error);
				return handlers.group(err);
			}

			// Is this an answer for a first-time push or an answer for a resending ?
			if ( self.requestResent[m.rid] ) {
				if ( self.requestResent[m.rid].length > m.work.length )
					_debug("[client] WARNING: Comrade manager didn't accept all my resent works (requested: "+self.requestResent[m.rid].length+", accepted: "+m.work.length+")");
				else
					_debug("[client] Comrade manager accepted all my resent work! Another glass of vodka!");

				self._clientRegisterResentWork(m.rid,m.work);
			}
			else {
				var
					items = self.requestItems[m.rid];

				// Manager accepted all the works? Is supposed to accept!
				if ( items.length > m.work.length )
					_debug("[client] WARNING: Comrade manager didn't accept all my works (requested: "+items.length+", accepted: "+m.work.length+", ignored: "+parseInt(items.length-m.work.length)+")");
				else
					_debug("[client] Comrade manager accepted all my work! A glass of vodka for that!");

				// Register on all indexes
				self._clientRegisterWork(m.rid,m.work);
			}

		}
		else if ( m.to == "sysmsg" ) {
			if ( m.id == null || typeof(m.id) != "string" ) {
				_debug("Got an answer to a system message, but.. without id. Ignoring...");
				return;
			}
			if ( self.sysMessages[m.id] == null ) {
				_debug("Got an answer to a system message that doesn't exist. Ignoring...");
				return;
			}
			if ( self.sysMessages[m.id].handler != null )
				return self.sysMessages[m.id].handler(null,m);

			delete self.sysMessages[m.id];
			return;
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
				w = self.works[aw.id||''],
				handlers;

			// Maybe the work was aborted..
			if ( w == null )
				return;

			handlers = self.requestHandlers[w.request];
			self.requestResults[w.request].push(aw);
			reqs[w.request] = true;

			self.worksWithoutAnswer[w.id] = false;
			// delete self.worksWithoutAnswer[w.id];

			if ( handlers.individual )
				handlers.individual(aw.result.err,aw.result.data,w);
		});


		// Notify
		for ( var req in reqs ) {
			if ( self.requestResults[req].length >= self.requestWorks[req].length ) {
				_debug("Request #"+req+" reached the number of works: "+self.requestResults[req].length);
				self._clientRequestWorkDone(req,self.requestResults[req]);
			}
		}

	}

	// Ping
	else if ( m.command == "ping" ) {
		return self._command("answer",{to: "ping", current: new Date()});
	}

	// System message
	else if ( m.command == "sysmsg" ) {

		var
			origin = m.from ? ("comrade "+m.from) : 'somebody';

		_debug("Received a system message from comrade "+origin);

		self.emit('sysmsg',m.content,m.from);
		self._command("answer",{ to: "sysmsg", id: m.id, received: new Date().getTime() });

	}

}

// Register work
function _clientRegisterWork(rid,arrWorks) {

	// Get new ID

	var
		self = this,
		items = self.requestItems[rid],
		x = 0;

	// If the timeout fired, can be no request items anymore
	if ( !items )
		return;

	self.sentSomething = true;
	self.requestWorks[rid] = arrWorks;
	arrWorks.forEach(function(id){
		self.works[id] = {
			id: id,
			pushed: new Date(),
			request: rid,
			original: items[x]
		};
		self.worksRequestPos[id] = x++;
		self.worksWithoutAnswer[id] = true;
	});

	self.requestResults[rid] = [ ];

}

// Register resent work
function _clientRegisterResentWork(rid,arrWorks) {

	var
		self = this,
		x = 0;

	// Replace the old work ID's with the new ones
	self.requestResent[rid].forEach(function(oldWorkID){

		var
			newWorkID = arrWorks[x++],
			w = self.works[oldWorkID];

		if ( w == null )
			return;

		// Replace
		_arrReplace(self.requestWorks[rid],oldWorkID,newWorkID);
		self.worksRequestPos[newWorkID] = self.worksRequestPos[oldWorkID];
		self.works[newWorkID] = w;
		self.worksWithoutAnswer[newWorkID] = true;

		// Remove marks of old jobs ID's
		delete self.works[oldWorkID];
		delete self.worksRequestPos[oldWorkID];
		delete self.worksWithoutAnswer[oldWorkID];

		// Change the work
		w.resent = new Date();
		w.id = newWorkID

	});
	delete self.requestResent[rid];

}

// Generate new clint ID
function _clientNewRequestID() {

	var
		d = new Date().getTime().toString(),
		id;

	do {
		id = "R"+d.substr(d.length-6,6) + "r" + Math.floor(Math.random()*1001);
	} while ( this.requestHandlers[id] != null );

	return id;

}

// Client work is done
function _clientRequestWorkDone(req,works) {

	var
		self = this,
		results = [];

	_debug("Request #"+req+" seems complete ("+self.requestResults[req].length+" vs "+self.requestWorks[req].length+")!");

	// Register completed works by request
	works.forEach(function(aw){
		var
			w = self.works[aw.id];
		results[self.worksRequestPos[w.id]] = aw.result;
	});

	_debug("Request #"+req+" is complete!");

	self._clientRequestAnswer(req,results);

}

// Answer to the callback and terminate request
function _clientRequestAnswer(req,results) {

	var
		self = this,
		opts = self.requestOpts[req],
		handlers = self.requestHandlers[req];

	_debug("Terminaring request #"+req+" ...");

	// Run the request handler
	if ( opts.sentArray )
		handlers.group(null,results,results);
	else
		handlers.group(results[0].err,results[0].data,self.works[self.requestWorks[req][0]]);

	// Cleanup
	if ( self.requestWorks[req] ) {
		self.requestWorks[req].forEach(function(w){
			delete self.works[w];
			delete self.worksRequestPos[w];
			delete self.worksWithoutAnswer[w];
		});
	}
	delete self.requestItems[req];
	delete self.requestOpts[req];
	delete self.requestHandlers[req];
	delete self.requestWorks[req];
	delete self.requestResults[req];
	delete self.requestResent[req];

}

// Abort a sent or on-course request
function _clientRequestAbort(rid) {

	var
		self = this;

	return self._command("abort",{rid: rid});

}


// On error
function _clientOnError() { }

// On disconnect
function _clientOnDisconnect() {

	if ( !this.connected )
		return;

	_debug("Comrade manager disconnected");
	this.connected = false;

	return this._clientConnect();

}


// Send a system message
function systemMessage(msg,opts,handler) {

	var
		self = this,
		id = self._sysMessageNewID(),
		_msg;

	if ( typeof opts == "function" ) {
		handler = opts;
		opts = {};
	}

	// Build raw message
	_msg = opts || {};
	_msg.id = id;
	_msg.content = msg;

	// Register the message
	self.sysMessages[id] = {
		rawMsg:	  _msg,
		sent:	  new Date(),
		handler:  handler || function(){}
	};

	// Wait for connection and do the things
	return this._waitConnection(function(err){
		if ( err )
			return handler(err,null);

		return self._command("sysmsg",_msg);
	});

}


// Run work
function clientWork(works,opts,handler) {

	var
		self = this,
		rid = self._clientNewRequestID(),
		items = _clientWorkPrepare((works instanceof Array) ? works : [works]),
		timeout,
		timedOut = false;

	// Opts is handler ? (backport compatibility)
	if ( typeof(opts) == "function" && !handler ) {
		handler = opts;
		opts = {};
	}

	// Set options
	opts.rid = rid;
	opts.return = "group";
	opts.work = items;
	opts.sentArray = (works instanceof Array);
	if ( opts.keepState == null && self.keepState != null )
		opts.keepState = self.keepState;
	// Client-side timeout
	if ( opts.timeout ) {
		timeout = setTimeout(function(){
			var errors = [];
			items.forEach(function(w){
				errors.push({err:{code:"ECSTO"}});
			});
			self._clientAbortConWaiter(rid);
			self._clientRequestAbort(rid);
			self._clientRequestAnswer(rid,errors);
			timedOut = true;
		},opts.timeout);
		delete opts['timeout'];
	}
	// Run timeout
	if ( opts.runTimeout )
		opts.timeout = opts.runTimeout;

	self.requestOpts[rid] = opts;

	// Set request items and handlers
	self.requestItems[rid] = items;
	self.requestHandlers[rid] = {
		group: function(err,res){
			if ( timedOut )
				return;
			clearTimeout(timeout);
			return handler(err,res);
		}
	};

	// Wait for connection and do the things
	return this._waitConnection(function(err){
		if ( err )
			return handler(err,null);

		return self._command("push",opts);
	},rid);

}


// Prepare items
function _clientWorkPrepare(items) {

	var
		_items = [];

	// Check all items
	items.forEach(function(i){
		if ( typeof(i) == "function" )
			return _items.push({ _Fn: true, _code: i.toString('utf8') });
		_items.push(i);
	});

	return _items;

}


// Run work and fire handler everytime a work finish
function clientWorkIndividual(works,opts,iHandler,gHandler) {

	var
		self = this,
		rid = self._clientNewRequestID(),
		items = _clientWorkPrepare((works instanceof Array) ? works : [works]),
		timeout,
		timedOut = false;

	// Options or null ?
	if ( opts == null )
		opts = {};

	// Set options
	opts.rid = rid;
	opts.return = "each";
	opts.work = items;
	opts.sentArray = (works instanceof Array);

	// Client-side timeout
	if ( opts.timeout ) {
		timeout = setTimeout(function(){
			// Fire timeout on every work without answer from this request
			if ( iHandler ) {
				// Has registered works?
				if ( self.requestWorks[rid] ) {
					self.requestWorks[rid].forEach(function(w){
						if ( self.worksWithoutAnswer[w.id] ) {
							if ( iHandler )
								iHandler({code:"ECSTO"},null,w);
						}
					});
				}
				// No registered works? Just a bunch of errors..
				else {
					self.requestItems[rid].forEach(function(w){
						if ( iHandler )
							iHandler({code:"ECSTO"},null,w);
					});
				}
			}
			var results = self.requestResults[rid];
			// Has registered works?
			if ( self.requestWorks[rid] ) {
				self.requestWorks[rid].forEach(function(id){
					if ( self.worksWithoutAnswer[id] )
						self.requestResults[rid].push({err:{code:"ECSTO"}});
				});
			}
			// No registered works? Just a bunch of errors..
			else {
				results=[];
				items.forEach(function(w){
					results.push({err:{code:"ECSTO"}});
				});
			}
			self._clientRequestAbort(rid);
			self._clientRequestAnswer(rid,results);
			timedOut = true;
		},opts.timeout);
		delete opts['timeout'];
	}
	// Run timeout
	if ( opts.runTimeout )
		opts.timeout = opts.runTimeout;

	// Set request items, options and handlers
	self.requestOpts[rid] = opts;
	self.requestItems[rid] = items;
	self.requestHandlers[rid] = {
		group: function(err,res){
			if ( timedOut )
				return;
			clearTimeout(timeout);
			return gHandler(err,res);
		},
		individual: iHandler
	};

	// Wait for connection and do the things
	return this._waitConnection(function(err){
		if ( err )
			return handler(err,null);

		return self._command("push",opts);
	},rid);

}


// Send again the works that were not finished (between send and disconnect+connect)
function _clientResentUnfinished() {

	var
		self = this,
		requestWorks = {},
		requestResent = {},
		total = 0,
		w;

	// Do we have unfinished requests ?
	for ( var id in self.worksWithoutAnswer ) {
		if ( !self.worksWithoutAnswer[id] )
			continue;

		w = self.works[id];
		if ( w == null || !w.request )
			continue;
		if ( requestWorks[w.request] == null ) {
			requestWorks[w.request] = [w.original];
			requestResent[w.request] = [id];
		}
		else {
			requestWorks[w.request].push(w.original);
			requestResent[w.request].push(id);
		}
		total++;
	}
	if ( total == 0 )
		return;

	_debug("[client] Resending unfinished works...",requestResent);

	// For each request 
	for ( var rid in requestWorks ) {
		var
			opts = self.requestOpts[rid];

		opts.work = requestWorks[rid];
		self._command("push",opts);
		self.requestResent[rid] = requestResent[rid];
	}

}


// Generate a new message id
function _sysMessageNewID() {

	var
		d = new Date().getTime().toString(),
		id;

	do {
		id = "M"+d.substr(d.length-6,6) + "." + Math.floor(Math.random()*1001);
	} while ( this.sysMessages[id] != null );

	return id;	

}


// Replace on array
function _arrReplace(array,oldItem,newItem) {
	var
		idx = array.indexOf(oldItem);
	if ( idx == -1 )
		return;
	array[idx] = newItem;
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
