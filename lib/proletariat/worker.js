"use strict";

var
	events		= require('events'),
	util		= require('util'),
	net		= require('net'),
	Stream		= require('./stream').stream.Stream,

	SLOTS		 = 100,
	CLEANUP_REQS	 = 1000,
	CLEANUP_CHECKINT = 60000,
	CON_RETRYTIME	 = 2000,
	DEBUG		 = false,

	seq = 1;


/*
 * Worker
 *
 * constructor:
 *
 *   new Worker()
 *
 * methods:
 *
 *   - start()
 *   - stop()
 *
 * events:
 *
 *   - work(work)
 *   - error(err)
 *   - close()
 */

function Worker(opts) {

	var
		self = this;

	// Options

	if ( opts == null )
		opts = { };

	// Variable properties

	this.maxSlots		= opts.slots		|| SLOTS;
	this.prioritySlots	= opts.prioritySlots	|| {};
	this.host		= opts.host		|| "127.0.0.1";
	this.port		= opts.port		|| 1917;
	this.CLEANUP_REQS	= opts.CLEANUP_REQS	|| CLEANUP_REQS;
	this.CLEANUP_CHECKINT	= opts.CLEANUP_CHECKINT	|| CLEANUP_CHECKINT;
	this.CON_RETRYTIME	= opts.CON_RETRYTIME	|| CON_RETRYTIME;
	this.ANSWER_THRESHOLD	= opts.ANSWER_THRESHOLD	|| 1;

	// Fixed properties

	this.id			= seq++;
	this.s			= null;
	this.status		= "offline";
	this.stream		= null;
	this.lastCommand	= null;
	this.finishCount	= 0;
	this.isClean		= true;
	this.availableSlots	= this.maxSlots;

	// Data support

	this.workingQueue	= {};
	this.answerList		= [];

	this.resultCache	= { };

	// Methods

	this.start = workerStart;
	this.stop = workerStop;
	this.finishWork = _workerFinishWork;
	this._workerConnect = _workerConnect;
	this._workerStartBiz = _workerStartBiz;
	this._workerOffer = _workerOffer;
	this._workerReceiveWork = _workerReceiveWork;
	this._workerOnMessage = _workerOnMessage;
	this._workerOnError = _workerOnError;
	this._workerOnDisconnect = _workerOnDisconnect;
	this._command = _command;
	this._send = _send;
	this._cleanup = _cleanup;
	this._cleanupProcess = _cleanupProcess;

	this._cleanupInterval = setInterval(function(){self._cleanupProcess()},this.CLEANUP_CHECKINT);

	// Debug

	DEBUG		= opts.DEBUG || false;

}
util.inherits(Worker, events.EventEmitter);


// Start worker

function workerStart() {

	_debug("[worker #"+this.id+"] Starting (manager: "+this.host+":"+this.port+")");

	return this._workerConnect();

}

function _workerConnect() {

	var
		self = this;

	self.s = net.connect({host: self.host, port: self.port}, function(){
		_debug("[worker #"+self.id+"] Connected to comrade manager");
		self.status = "online";
		self.stream = new Stream("string",self.s);
		self.stream.on('message',function(m){self._workerOnMessage(m)});
		self.stream.on('error',function(err){self._workerOnError(err)});
		self.stream.on('close',function(){self._workerOnDisconnect()});
		self._workerStartBiz();
	});
	self.s.on('error',function(err){
		if ( err.code ) {
			if ( err.code == "ECONNREFUSED" ) {
				_debug("Could not connect to manager. Retrying in "+self.CON_RETRYTIME+"ms...");
				return setTimeout(function(){
					return self._workerConnect();
				}, self.CON_RETRYTIME);
			}
		}
		else {
			_debug("No error code, ignoring by logging: "+err.toString());
		}
	});

}

// Start business here

function _workerStartBiz() {

	// Offer our slots

	this._workerOffer();

}

// Make an offer

function _workerOffer() {

	// Offer our slots

	var
		offer = this.availableSlots;

	if ( typeof(this.prioritySlots) == "object" && Object.keys(this.prioritySlots).length > 0 ) {
		var
			rest = this.maxSlots;

		for ( var p in this.prioritySlots ) {
			if ( parseInt(p) )
				rest -= this.prioritySlots[p];
		}
		if ( rest < 0 ) {
			_debug("[worker #"+this.id+"] Fail: Bad configuration. No available slots for ZERO priority");
			process.exit(0);
		}

		this.prioritySlots[0] = rest;
		offer = this.prioritySlots;
	}
	_debug("[worker #"+this.id+"] Offering "+this.availableSlots+" slots"+((typeof(offer) == "object")?" (priority slots: "+JSON.stringify(this.prioritySlots)+")":""));
	this._command("offer",{slots: offer});

}


// Stop manager

function workerStop() {

	this.s.close();
	this.s = null;
	_debug("[worker #"+self.id+"] остановившийся!");

}


// Handle message (highlevel stuff)

function _workerOnMessage(msg) {

	var
		self = this,
		m;

	try {
//		_debug("> "+msg.toString('utf8'));
		m = JSON.parse(msg.toString('utf8'));
	}
	catch(ex) {
		_debug("[worker #"+self.id+"] Is comrade manager drunk or what? Got invalid JSON. Ignoring message: ",ex);
		return;
	}

	// Answer to my requests

	if ( m.command == "answer" ) {

		if ( m.to == "offer" ) {

			if ( self.lastCommand != "offer" ) {
				_debug("[worker #"+self.id+"] Comrade manager is answering me to offer but i didn't make any offer, ignoring..");
				return;
			}

			if ( m.error ) {
				_debug("[worker #"+self.id+"] Comrade manager didn't accept my offer. Sad... I will try later.");
				return setTimeout(function(){
					self._workerOffer();
				},1000);
			}

			if ( m.you != null ) {
				_debug("[worker #"+self.id+"] Changing name to "+m.you);
				self.id = m.you;
			}

			self.status = "work";
			_debug("[worker #"+self.id+"] Got OK from comrade manager as answer to 'offer' command. I will be waiting for work...");
		}
		else if ( m.to == "ping" ) {
			_debug("[worker #"+self.id+"] Comrade manager answered to ping request: ",m);
		}
		else if ( m.to == "done" ) {
			_debug("[worker #"+self.id+"] Comrade manager answered to my 'done': "+m.description);
		}
		else {
			_debug("Answer to something that I don't know");
		}
		return;
	}

	// Work push

	else if ( m.command == "push" ) {

		return self._workerReceiveWork(m.work);

	}
	else if ( m.command == "ping" ) {

		return self._command("answer",{ to: "ping", current: new Date() });

	}
	else if ( m.command == "sysmsg" ) {

		var
			origin = m.from ? ("comrade "+m.from) : 'somebody';

		_debug("Received a system message from comrade "+origin);

		self.emit('sysmsg',m.content,m.from);
		self._command("answer",{ to: "sysmsg", id: m.id, received: new Date().getTime() });

	}
	else {

		_debug("I don't support command '"+m.command+"'",m);

	}

}


// Receive work

function _workerReceiveWork(works) {

	var
		self = this,
		workByID = {};

	if ( !(works instanceof Array) ) {
		_debug("[worker #"+self.id+"] Got work but it is not an Array.. hmn, discarding..");
		return self._command("answer",{ to: "push", error: { code: "EINVWORK", description: "Invalid work ?array?" } });
	}


	// What jobs can i accept and what i need to reject ?

	var
		acceptedWorks = [],
		rejectedWorks = [];

	works.forEach(function(w){
		if ( w.id == null )
			return;

		workByID[w.id] = w;
		if ( w.args == null || acceptedWorks.length >= self.availableSlots )
			return rejectedWorks.push(w.id);

		acceptedWorks.push(w.id);
	});

	// Got work, let's push it into the queue and work!

	acceptedWorks.forEach(function(id){
		var w = workByID[id];
		_debug("[worker #"+self.id+"] Got a new work: "+w.id);
		self.workingQueue[w.id] = w;
		self.availableSlots--;

		// If the arguments is a function, eval it

		if ( typeof(w.args) == "object" && w.args._Fn && w.args._code ) {
			var _Fn = {};
			w.args = eval(w.args._code.replace(/^function\s+/,"_Fn['"+w.id+"'] = function "));
		}
	});

	// Answer

	var
		a = { to: "push" };

	if ( acceptedWorks.length > 0 ) {
		a.accepted = acceptedWorks;
		a.description = "i'll do my best";
	}
	if ( rejectedWorks.length > 0 ) {
		_debug("[worker #"+self.id+"] REJECTED "+rejectedWorks.length+" work(s)");
		a.rejected = rejectedWorks;
		a.description = "some works were rejected";
		a.allocation = { was: self.availableSlots+acceptedWorks.length, is: self.availableSlots, rejected: rejectedWorks.length, got: works.length };
	}

	self._command("answer",a);


	// Emit 'work' events for accepted works

	acceptedWorks.forEach(function(id){

		// Set timeout

		if ( self.workingQueue[id].timeout != null && parseInt(self.workingQueue[id].timeout) ) {
			_debug("Work #"+id+" has timeout of "+self.workingQueue[id].timeout+" ms");
			self.workingQueue[id]._timeout = setTimeout(function(){
				if ( self.workingQueue[id] == null )
					return;
				_debug("[worker #"+self.id+"] Work #"+id+" timed out!!!");
				self.workingQueue[id].finishStatus = "timeout";
				self.finishWork(self.workingQueue[id],{ err: { code: 'ETO', message: 'Timeout' }, data: null });
			}, self.workingQueue[id].timeout);
		}

		// Make it work

		self.emit('work',self.workingQueue[id],function(err,data){
			// Maybe timed out
			if ( !self.workingQueue[id] || self.workingQueue[id].finishStatus )
				return;
			clearTimeout(self.workingQueue[id]._timeout);
			self.workingQueue[id].finishStatus = "ok";
			self.finishWork(self.workingQueue[id],{ err: err, data: data });
		});
	});

}


// Finish a work

function _workerFinishWork(w,result) {

	var
		self = this;

	if ( !w ) {
		_debug("This work has already finish. Watch your handlers");
		return;
	}
	if ( !w.id )
		throw new Error("Finished job has no id!");

	_debug("[worker #"+self.id+"] Finished job "+w.id+" ("+w.finishStatus+")");

	// If we are offline, forget!

	if ( self.status == "offline" ) {
		_debug("[worker #"+self.id+"] Doing nothing because I'm offline");
		return;
	}

	// Assign the result to the work

	if ( result.err instanceof Error ) {
		result.err = { message: result.err.message };
	}
	w.result = result;

	// Delete from working queue and free some slots

	self.isClean = false;
	self.workingQueue[w.id] = null;
//	delete self.workingQueue[w.id];
	self.availableSlots++;


	// TODO: offline results cache
	// If jobs are finishing while we are offline, cache the results for sending later to manager.
	//
	// For sending results back to manager, the manager need to know that we are the same client
	//	(for not accepting results from every client, so we have to implement something like session ID's)
	// Am I offline ? Keep on results cache for sending later to the manager
	//
	//if ( self.status == "offline" ) {
	//	self.resultCache[w.id] = w;
	//	setTimeout(function(){
	//		_debug("[worker #"+self.id+"] Work #"+w.id+" result was put on the garbage (we couldn't send to manager)");
	//		delete self.resultCache[w.id];
	//	},60000
	//	return;
	//}


	// Answer

	self.answerList.push({id: w.id, result: w.result });

	if ( self.answerList.length >= self.ANSWER_THRESHOLD || self.availableSlots == self.maxSlots ) {
		self._command("done",{work: self.answerList});
		self.answerList = [];
	}

	// Cleanup ?

	if ( (++self.finishCount % self.CLEANUP_REQS) == 0 ) {
		self.finishCount = 0;
		self._cleanup();
	}
	else {
		if ( self.availableSlots == self.maxSlots )
			self.canCleanup = true;
	}

}


// Error ?

function _workerOnError(err) {
	_debug("[worker #"+this.id+"] Got error: ",err);
}

// Disconnect ?

function _workerOnDisconnect() {

	var
		self = this;

	_debug("[worker #"+this.id+"] Comrade manager disconnected, reseting and reconnecting in "+self.CON_RETRYTIME+"ms...");

	this.status = "offline";

	// FIXME: We should implement session keeping, instead of reseting everything
	this.workingQueue = {};
	this.availableSlots = this.maxSlots;

	setTimeout(function(){
		self._workerConnect();
	}, self.CON_RETRYTIME);

}


// Tell things to a client

function _send(obj) {

	if ( this.status == "offline" )
		return;

//	_debug("< ",JSON.stringify(obj));
	try {
		return this.stream.sendMessage(JSON.stringify(obj));
	}
	catch(ex) {
		var util = require('util');
		_debug("[worker #"+this.id+"] Error sending message "+ex.toString()+": ",util.inspect(obj,{depth: 10}));
		return this.stream.sendMessage(JSON.stringify({error: ex}));
	}

}
function _command(command,args) {
	var
		o = args || { };

	this.lastCommand = command;
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


// Cleanup


function _cleanupProcess() {

	_debug("[worker #"+this.id+"] Available: "+this.availableSlots);

	if ( this.availableSlots < 0 ) 
		throw new Error("NEGATIVE availableSlots");
	if ( this.canCleanup && this.availableSlots == this.maxSlots && !this.isClean )
		return this._cleanup();

}
function _cleanup() {

	var
		self = this,
		lists = [this.workingQueue];

	_debug("[worker #"+this.id+"] CLEANUP");

	lists.forEach(function(list){
	 	for ( var k in list ) {
	 		if ( list[k] == null )
	 			delete list[k];
	 	}
	});

	self.isClean = true;

}

// Self object

exports.Worker = Worker;
