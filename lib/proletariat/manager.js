"use strict";

var
	events		 = require('events'),
	util		 = require('util'),
	net		 = require('net'),
	Stream		 = require('./stream').stream.Stream,

	AVAIL_THRESHOLD	 = 50,
	CLEANUP_REQS	 = 1000,
	CLEANUP_CHECKINT = 60000,
	DISTRIB_RANDMAX	 = 100,
	DEBUG		 = false,

	first = null;

/*
 * Manager
 *
 * constructor:
 *
 *   new Manager()
 *
 * methods:
 *
 *   - start()
 *   - stop()
 *   - pushWork(work)
 *
 * events:
 *
 *   - finish(work)
 *   - error(err)
 */

function Manager(opts) {

	var
		self = this;

	// Options

	if ( opts == null )
		opts = {};

	// Variable properties

	this.port		= opts.port			|| 1917;
	this.AVAIL_THRESHOLD	= opts.AVAIL_THRESHOLD		|| AVAIL_THRESHOLD;
	this.CLEANUP_REQS	= opts.CLEANUP_REQS		|| CLEANUP_REQS;
	this.CLEANUP_CHECKINT	= opts.CLEANUP_CHECKINT		|| CLEANUP_CHECKINT;
	this.DISTRIB_RANDMAX	= opts.DISTRIB_RANDMAX		|| DISTRIB_RANDMAX;	
	this.SACRED_GUARANTEES	= opts.SACRED_GUARANTEES	|| false;
	this.HOLDSIMILARWORK	= opts.HOLDSIMILARWORK		|| false;

	// Fixed properties

	this.s					= null;
	this.globalAvailableSlots		= 0;
	this.globalRunningWorks			= 0;
	this.finishCount			= 0;
	this.canCleanup				= false;
	this.isClean				= true;
	this.wasFull				= false;
	this.bootTime				= (new Date()).getTime();

	// Data support

	this.workQueue				= { 0: [ ] };
	this.pendingWorkLoad			= 0;
	this.worksOnHold			= { };
	this.clients				= { };
	this.workers				= { };
	this.priorityRanges			= [ {from: 0, limit: 0, used: 0, workers: {}} ];
	this.requests				= { };
	this.works				= { };
	this.sysMessages			= { };

	// Methods

	this.start				= managerStart;
	this.stop				= managerStop;
	this._pingCheck				= _pingCheck;
	this.workDistribute			= _workDistribute;
	this.workSelectWorker			= _workSelectWorker;
	this._workSelectWorker			= _workSelectWorker;
	this._workNewID				= _workNewID;
	this._workDispatchClient		= _workDispatchClient;
	this._workFireAssignTimeout		= _workFireAssignTimeout;
	this._queuePush				= _queuePush;
	this._queueUnshift			= _queueUnshift;
	this._queueRemove			= _queueRemove;
	this._priorityRangesMerge		= _priorityRangesMerge;

	this._clientInit			= _clientInit;
	this._clientDestroy			= _clientDestroy;
	this._clientNewID			= _clientNewID;
	this._clientNewPingTime			= _clientNewPingTime;
	this._clientMessage			= _clientMessage;
	this._clientRegisterOffer		= _clientRegisterOffer;
	this._clientUnregisterOffer		= _clientUnregisterOffer;
	this._clientRegisterOffer_NonSacred	= _clientRegisterOffer_NonSacred;
	this._clientRegisterOffer_Sacred	= _clientRegisterOffer_Sacred;
	this._clientPriorityRangeFor		= _clientPriorityRangeFor;
	this._clientPushWork			= _clientPushWork;
	this._clientAcceptWork			= _clientAcceptWork;
	this._clientRejectWork			= _clientRejectWork;
	this._clientGiveupWork			= _clientGiveupWork;
	this._clientSendBackWork		= _clientSendBackWork;
	this._clientFinishWork			= _clientFinishWork;
	this._clientAbortRequest		= _clientAbortRequest;
	this._clientAbortWork			= _clientAbortWork;
	this._clientRegisterSysMessage		= _clientRegisterSysMessage;

	this._cleanup				= _cleanup;
	this._cleanupProcess			= _cleanupProcess;
	this._send				= _send;
	this._command				= _command;
	this._answer				= _answer;
	this._error				= _error;

	this._cleanupInterval			= setInterval(function(){ self._cleanupProcess() },this.CLEANUP_CHECKINT);

	// Debug

	DEBUG = opts.DEBUG || false;

}
util.inherits(Manager, events.EventEmitter);


// Start manager

function managerStart() {

	var
		self = this;

	this.s = net.createServer(function(con){ self._clientInit(con) });
	this.s.listen(self.port || 1917, function(){
		_debug("Listening");
	});

	// Watch ping times

	this._pingCheckInterval = setInterval(function(){self._pingCheck()},10000);

}

// Stop manager

function managerStop() {

	// Stop watching ping times

	clearInterval(this._pingCheckInterval);

	// Stop server

	s.close();
	s = null;
	_debug("остановившийся!");

}


// Watch ping times

function _pingCheck() {

	var
		self = this,
		curTime = new Date().getTime();

	for ( var id in self.clients ) {
		var
			c = self.clients[id];

		if ( c == null )
			continue;

		if ( c.pingTime < curTime-15000 ) {
			_debug("Client "+c.id+" didn't answer to my ping after 15 seconds. Ping timeout! Killing him...");
			self._clientDestroy(c,true);
		}
		else if ( c.pingTime < curTime ) {
//			_debug("Sending ping to client "+c.id+"...");
			self._command(c,"ping");
		}
	}

}


// Fire work assign timeout

function _workFireAssignTimeout(w) {

	var
		self = this;

	_debug("Work "+w.id+" was not assigned after "+w.assigntimeout+"ms and timed out");

	if ( !w.requester || !self.clients[w.requester] ) {
		_debug("Work "+w.id+" has no requester??! Huge fail");
		return;
	}

	// Emit assigntimeout events

	self.emit('assigntimeout',w);

	// Remove from list and queue

//	delete self.works[w.id];
	self.works[w.id] = null;
	self.requests[w.rid].works[w.id] = null;
//	delete self.requests[w.rid].works[w.id];
	self.requests[w.rid].workCount--;
	if ( self.requests[w.rid].workCount == 0 )
		self.requests[w.rid] = null;
	self._queueRemove([w]);

	// Answer to requester

	return self._command(self.clients[w.requester],"done",{ work: [{id: w.id, result: { err: { code: 'EATO', message: 'Assign timeout' }, data: null }}] });

}


// Push to queue

function _queuePush(items) {

	var
		self = this,
		works = (items instanceof Array) ? items : [items];

	works.forEach(function(w){
		if ( self.workQueue[w.priority] == null )
			self.workQueue[w.priority] = [];
		self.workQueue[w.priority].push(w);
	});
	self.pendingWorkLoad += works.length;

}


// Unshift on queue

function _queueUnshift(items) {

	var
		self = this,
		works = (items instanceof Array) ? items : [items];

	works.forEach(function(w){
		if ( self.workQueue[w.priority] == null )
			self.workQueue[w.priority] = [];
		self.workQueue[w.priority].unshift(w);
	});
	self.pendingWorkLoad += works.length;

}


// Remove items from the queue

function _queueRemove(items) {

	var
		self = this,
		works = (items instanceof Array) ? items : [items],
		foundNr = 0;

	works.forEach(function(w){
		if ( self.workQueue[w.priority] == null )
			return;
		for ( var x = 0 ; x < self.workQueue[w.priority].length ; x++ ) {
			if ( self.workQueue[w.priority][x].id == w.id ) {
				self.workQueue[w.priority].splice(x,1);
				foundNr++;
				break;
			}
		}
	});
	self.pendingWorkLoad -= foundNr;

}

// Remove items from the queue

function _queueRemove(items) {

	var
		self = this,
		works = (items instanceof Array) ? items : [items],
		idx;

	works.forEach(function(w){
		if ( self.workQueue[w.priority] == null )
			return;
		// Locate work

		idx = self.workQueue[w.priority].indexOf(w);
		if ( idx == -1 )
			return;

		self.workQueue[w.priority].splice(idx,1);
		self.pendingWorkLoad--;
	});

}


// Merge priority ranges (just for reporting purposes)

function _priorityRangesMerge() {

	var
		self = this,
		mergedRanges = [],
		pos = 0;

	for ( var id in self.clients ) {
		var
			c = self.clients[id];

		if ( c == null || c.priorityRanges == null )
			continue;

		c.priorityRanges.forEach(function(range){

			// Check if we already have this priority on the merged range

			for ( pos = 0 ; pos < mergedRanges.length ; pos++ ) {
				if ( mergedRanges[pos].from >= range.from )
					break;
			}
			if ( !mergedRanges[pos] )
				mergedRanges.push({from: range.from, limit: range.limit, used: range.used, workers: [c.id]});
			else if ( mergedRanges[pos].from == range.from ) {
				mergedRanges[pos].limit += range.limit;
				mergedRanges[pos].used += range.used;
				mergedRanges[pos].workers.push(c.id);
			}
			else
				mergedRanges.splice(pos,0,{from: range.from, limit: range.limit, used: range.used, workers: [c.id]});

		});
	}

	return mergedRanges;

}


// Generate new clint ID

function _clientNewID() {

	var
		d = new Date(),
		id;

	do {
		id = "C"+d.getTime().toString() + "." + Math.floor(Math.random()*1001);
	} while ( this.clients[id] != null );

	return id;

}


// New ping time

function _clientNewPingTime() {

	return new Date((new Date()).getTime()+30000);

}


// Handle client initialization

function _clientInit(con) {

	var
		self = this,
		c;

	con._id = this._clientNewID();
	this.clients[con._id] = c = {
		id: con._id,
		con: con,
		connectTime: new Date(),
		pingTime: self._clientNewPingTime(),

		// Stream

		stream: new Stream("string",con),

		// High level stuff

		status: "new",
		type: "unknown",
		offer: {},
		works: {},
		workRanges: {},
		sentWorks: {},
		totalSlots: 0,
		availableSlots: 0,
		busySlots: 0,
		priorityRanges: [ ]
	};
	con.on('error',function(err){
		_debug("Client "+c.id+" connection error: ",err);
	});
	con.on('end',function(){
//		self._clientDestroy(c);
	});
	con.on('close',function(){
//		self._clientDestroy(c);
	});
	c.stream.on('message',function(msg){
		self._clientMessage(c,msg);
	});
	c.stream.on('close',function(){
		self._clientDestroy(c);
	});
	c.stream.on('end',function(){
		self._clientDestroy(c);
	});
	c.stream.on('error',function(err,cantRecover){
		self._error(c,err);
		if ( cantRecover )
			self._clientDestroy(c,true);
	});

	_debug("Comrade "+c.id+" connected");

}


// Handle client message (highlevel stuff)

function _clientMessage(c,msg) {

	var
		self = this,
		m;

	try {
		m = JSON.parse(msg.toString('utf8'));
//		_debug(c.id+" > ",JSON.stringify(m));
	}
	catch(ex) {
		_debug("Is comrade "+c.id+" drunk or what? Got invalid JSON. Ignoring message: ",ex);
		_debug("Original was: ",msg.toString('utf8'));
		return;
	}

	// Update ping time

	c.pingTime = self._clientNewPingTime();


	// Offer command
	if ( m.command == "offer" ) {

		if ( c.status != "new" )
			return self._answer(c,"offer",{ error: { code: "EINVCMDSTAT1", description: "You are not new here." } });

		var
			offer = { };

		if ( typeof(m.slots) == "number" && m.slots > 0 )
			offer['0'] = m.slots;
		else if ( typeof(m.slots) == "object" && parseInt(m.slots['0']) >= 0 ) {
			for ( var p in m.slots ) {
				var
					pMin = parseInt(p),
					slots = parseInt(m.slots[p]);
				if ( pMin >= 0 && slots >= 0 )
					offer[pMin] = slots;
			}
		}
		else
			return self._answer(c,"offer",{ error: { code: "EINVSLOTNR", description: "Invalid/Unexistent slot number" } });

		// Register offer

		self._clientRegisterOffer(c,offer);

		c.status = "available";
		c.type = "worker";
		self.workers[c.id] = c;

		_debug("Comrade "+c.id+" offered "+c.totalSlots+" work slots (by "+(self.SACRED_GUARANTEES?"sacred ":"")+"priority: "+JSON.stringify(offer)+"). He will be considered a worker");
		self._answer(c,"offer",{ description: "You are very nice comrade", you: c.id });

		return setTimeout(function(){ self.workDistribute(); },parseInt(Math.random()*DISTRIB_RANDMAX));
//		return process.nextTick(function(){ self.workDistribute(); });

	}

	// Push work command
	else if ( m.command == "push" ) {

		var
			requestID;

		if ( !m.rid )
			return self._answer(c,"push",{ error: { code: "ENORID", description: "No request ID" } });
		if ( !(m.work instanceof Array) || m.work.length == 0 )
			return self._answer(c,"push",{ error: { code: "EINVWORKL", description: "Invalid work list" } });

		// If he push some work, he's a client!
		c.type = "client";

		// Register request
		requestID = c.id+" "+m.rid;
		self.requests[requestID] = {
			id: requestID,
			oid: m.rid,
			works: {},
			workCount: 0
		};

		// Register his work
		var ids = self._clientPushWork(c,requestID,m.work,{
			timeout:	m.timeout,
			assigntimeout:	m.assigntimeout,
			priority:	parseInt(m.priority) || 0
		});
		_debug("Client "+c.id+" pushed this work: ",ids);

		self._answer(c,"push",{ rid: m.rid, work: ids });
		return setTimeout(function(){ self.workDistribute(); },parseInt(Math.random()*DISTRIB_RANDMAX));

	}

	// Work done command
	else if ( m.command == "done" ) {

		if ( c.status == "new" ) {
			_debug("Comrade "+c.id+" was answering me to done but he had no work (1)");
			return self._answer(c,"done",{ error: {code: "EINVCMDSTAT2", description: "You are a new comrade. You had not work"} });
		}
		if ( c.busySlots == 0 ) {
			_debug("Comrade "+c.id+" was answering me to done but he had no work (2)");
			return self._answer(c,"done",{ error: {code: "EINVSTAT1", description: "You had no work"} });
		}
		if ( !m.work || !(m.work instanceof Array) ) {
			_debug("Comrade "+c.id+" had invalid work list (wtf?)");
			return self._answer(c,"done",{ error: {code: "EINVWORKL", description: "Invalid work list"} });
		}

		var
			finishedWorks = [];

		m.work.forEach(function(aw){
			if ( typeof(aw) != "object" || !aw.id || !aw.result || !self.works[aw.id] || self.works[aw.id].status != "running" )
				return;
			finishedWorks.push(aw);
		});

		if ( finishedWorks.length > 0 ) {
			_debug("Comrade "+c.id+" finished "+finishedWorks.length+" work(s) in "+_nsec(self.works[finishedWorks[0].id].pushTime)+" ms");
			self._clientFinishWork(c,finishedWorks);
			self._answer(c,"done",{ description: "спасибо for the "+finishedWorks.length+" works" });
		}
		else
			self._answer(c,"done",{ description: "You didn't send nothing interesting sir" });

		// Distribute!

		setTimeout(function(){ self.workDistribute(); },parseInt(Math.random()*DISTRIB_RANDMAX));
//		process.nextTick(function(){ self.workDistribute(); });

		// Cleanup
		if ( (self.finishCount % self.CLEANUP_REQS) == 0 ) {
			self.finishCount = 0;
			self._cleanup();
		}
		else {
			if ( self.globalRunningWorks == 0 )
				self.canCleanup = true;
		}

		return;

	}

	// Abort (a request or a work) command
	else if ( m.command == "abort" ) {

		if ( m.rid == null && m.work == null ) {
			_debug("Comrade "+c.id+" was sending no request ID and no group");
			return self._answer(c,"abort",{ error: {code: "EABINVINP", description: "Invalid input for abort command. Need a group or a work list."} });
		}
		if ( m.rid && !self.requests[c.id+" "+m.rid] ) {
			_debug("Comrade "+c.id+" sent a request ID that doesn't exist.");
			return self._answer(c,"abort",{ error: {code: "EABRNOFO", description: "Request ID not found."} });
		}
		if ( m.work && !(m.work instanceof Array) ) {
			_debug("Comrade "+c.id+" sent work but is not a list of work");
			return self._answer(c,"abort",{ error: {code: "EINVWLI", description: "Invalid work list."} });
		}

		// Abort a request
		if ( m.rid ) {
			if ( !self._clientAbortRequest(c,c.id+" "+m.rid) )
				return self._answer(c,"abort",{ error: {code: "EREQNOTF", description: "Request not found."} });
			return self._answer(c,"abort",{ok: true, rid: m.rid });
		}

		// Abort specific works
		else if ( m.work ) {
			var abortedIDs = self._clientAbortWork(c,m.work);
			return self._answer(c,"abort",{ok: true, work: abortedIDs });
		}

	}

	// Ping command
	else if ( m.command == "ping" ) {
		return self._answer(c,"ping",{ current: new Date() });
	}

	// My(client) Status command
	else if ( m.command == "mystatus" ) {
		return self._command(c,"answer",{
			to: "mystatus",
			id: c.id,
			type: c.type,
			connected: c.connectTime,
			current: new Date(),
			status: c.status,
			ranges: c.priorityRanges
		});
	}

	// Status command
	else if ( m.command == "status" ) {

		var
			workers = [],
			clients = [],
			worksOnHold;

		for ( var id in self.clients ) {
			var
				cl = self.clients[id],
				item;
			if ( cl == null )
				continue;

			item = {id: id, status: cl.status};

			if ( cl.id == c.id )
				item.you = true;

			if ( cl.type == "worker" ) {
				item.ranges = cl.priorityRanges;
				item.offer = cl.offer;
				workers.push(item);
			}
			else
				clients.push(item);
		}

		// Count works on hold
		for ( var k in self.worksOnHold )
			worksOnHold += self.worksOnHold[k].length;

		return self._command(c,"answer",{
			to:			"status",
			bootTime:		self.bootTime,
			canCleanup:		self.canCleanup,
			isClean:		self.isClean,
			pendingWorks:		self.pendingWorkLoad,
			globalAvailableSlots:	self.globalAvailableSlots,
			globalRunningWorks:	self.globalRunningWorks,
			globalWorksOnHold:	worksOnHold,
			finishCount:		self.finishCount,
			sacredRanges:		self.SACRED_GUARANTEES,
			ranges:			self._priorityRangesMerge(),
			workers:		workers,
			clients:		clients
		});

	}

	// Dump all data command - Dump "self" into dump.js
	else if ( m.command == "dumpall" ) {
		var fs = require('fs');
		fs.writeFile("dump.js",util.inspect(self, false, null),function(err){
			if ( err )
				return self._command(c,"dumpall",{ok:false,err: err});
			_debug("DUMPALL");
			return self._command(c,"dumpall",{ok:true});
		});
		return;
	}

	// Force cleanup command
	else if ( m.command == "cleanup" ) {
		self._cleanup();
		self._command(c,"cleanup",{ok: true});
		return;
	}

	// GC command - Force garbage collector to run
	else if ( m.command == "gc" ) {
		global.gc();
		self._command(c,"gc",{ok: true});
		_debug("GARBAGE COLLECTOR");
		return;
	}

	// System message command
	else if ( m.command == "sysmsg" ) {

		// Has id ?
		if ( m.id == null || typeof(m.id) != "string" ) {
			_debug("Client "+c.id+" sent a system message without ID");
			return self._command(c,"answer",{to: "sysmsg", error: "System message needs an id comrade"});
		}

		// Register message
		return self._clientRegisterSysMessage(c,m);

	}


	// Answer to....
	else if ( m.command == "answer" ) {
		if ( m.to == "push" ) {
			// Rejected some work ?
			if ( m.rejected instanceof Array && m.rejected.length > 0 )
				self._clientRejectWork(c,m.rejected,m);

			// Accepted some work ?
			if ( m.accepted instanceof Array && m.accepted.length > 0 )
				self._clientAcceptWork(c,m.accepted);
		}
		else if ( m.to == "ping" ) {
//			_debug("Answer to ping from comrade "+c.id);
		}
		else if ( m.to == "sysmsg" ) {

			var
				msg;

			if ( m.id == null || typeof(m.id) != "string" ) {
				_debug("Comrade "+c.id+" sent an answer to a system message, without telling the id. Ignoring...");
				return;
			}

			msg = self.sysMessages[m.id];
			if ( msg == null ) {
				_debug("Comrade "+c.id+" sent an answer to a system message that doesn't exist. Ignoring...");
				return;
			}
			if ( ++msg.receivedBy == msg.sentTo ) {
				_debug("System message "+m.id+" was received by everybody. Answering back to the sender ("+(msg.from?msg.from.id:"(null)")+")");
				if ( msg.from == null || msg.from.status == "dead" ) {
					_debug("System message sender ("+(msg.from ? msg.from.id : "unknown")+") is not alive anymore, ignoring...");
					return;
				}
				self._command(msg.from,"answer",{ to:"sysmsg", id: msg.oid, done: true, sentTo: msg.sentTo, receivedBy: msg.receivedBy });
			}
			return;

		}
		else
			return self._error(c, {code: "EUNKNANDT", description: "Unknown answer type" });

		return;
	}

	return self._error(c,{ code: "EUNKNCMD", description: "Unknown command", command: m.command });

}


// Register client offer

function _clientRegisterOffer(c,offer) {

	c.offer = offer;

	if ( this.SACRED_GUARANTEES )
		c.availableSlots = c.totalSlots = this._clientRegisterOffer_Sacred(c,offer);
	else {
		c.availableSlots = c.totalSlots = this._clientRegisterOffer_NonSacred(c,offer);
	}

	this.globalAvailableSlots += c.totalSlots;

}

// Unregister client offer

function _clientUnregisterOffer(c,offer) {

//	this.globalAvailableSlots -= c.totalSlots;
	this.globalAvailableSlots -= c.availableSlots;

}


// Register on client priority range (non sacred priorities)
// Non sacred means: If they get too much, higher priority jobs can steal `guaranteed' space from lower priority jobs.

function _clientRegisterOffer_NonSacred(c,offer) {

	var
		priorities = Object.keys(offer).sort(function(a,b){ return parseFloat(a)-parseFloat(b) }),
		sum = 0;

	c.priorityRanges = [];
	priorities.forEach(function(prik){
		var
			pri = parseFloat(prik),
			slots = offer[prik];

		c.priorityRanges.push({from: pri, limit: sum+slots, used: 0 });
		sum += slots;
	});

	return sum;

}


// Register on client priority range (sacred priorities)
// Sacred priorities mean: If they get too much, higher priority jobs can steal space from zero priority jobs only.

function _clientRegisterOffer_Sacred(c,offer) {

	var
		priorities = Object.keys(offer).sort(function(a,b){ return parseFloat(a)-parseFloat(b) }),
		zero = 0,
		total = 0;

	c.priorityRanges = [];
	priorities.forEach(function(prik){
		var
			pri = parseFloat(prik),
			slots = offer[prik];

		if ( pri == 0 ) {
			c.priorityRanges.push({from: pri, limit: slots, used: 0 });
			zero = slots;
		}
		else
			c.priorityRanges.push({from: pri, limit: slots+zero, used: 0 });
		total += slots;
	});

	return total;

}


// Get priority range for a specific priority

function _clientPriorityRangeFor(c,priority) {

	var
		lastMatch = null;

	for ( var x = 0 ; x < c.priorityRanges.length ; x++ ) {
		if ( c.priorityRanges[x].from < priority )
			lastMatch = c.priorityRanges[x];
		else if ( c.priorityRanges[x].from == priority )
			return c.priorityRanges[x];
		else if ( c.priorityRanges[x].from > priority )
			return lastMatch;
	}

	return lastMatch;

}


// Client pushed work

function _clientPushWork(c,rid,items,opts) {

	var
		self = this,
		workIDs = [];


	items.forEach(function(item){

		// Create work
		var
			w = {
				id:		self._workNewID(),
				rid:		rid,
				key:		(typeof item == "object" && item._key) ? item._key : null,
				args:		item,
				timeout:	opts.timeout,
				assigntimeout:	opts.assigntimeout,
				priority:	opts.priority || 0,
				requester:	c.id,
				pushTime:	process.hrtime(),
				status:		"new"
			};

		// Timeouts
		if ( w.timeout && !parseInt(w.timeout) )
			w.timeout = null;
		if ( w.assigntimeout ) {
			if ( !parseInt(w.assigntimeout) )
				w.assigntimeout = null;
			else
				w._assignTimeout = setTimeout(function(){self._workFireAssignTimeout(w)},w.assigntimeout);
		}

		// Fire 'receive' events
		self.emit('receive',w);

		// Register work
		workIDs.push(w.id);
		self.works[w.id] = w;
		c.works[w.id] = w;
		self.requests[rid].works[w.id] = w;

		// Add to queue or put on hold
		if ( self.HOLDSIMILARWORK && w.key != null && self.worksOnHold[w.key] ) {
			_debug("Work "+w.id+" will be on hold"+(self.worksOnHold[w.key].length ? " (other "+self.worksOnHold[w.key].length+" with key '"+w.key+"' are on hold)" : ""));
			w.status = "onhold";
			self.worksOnHold[w.key].push(w);
		}
		else {
			self._queuePush(w);
			w.status = "queued";
			if ( self.HOLDSIMILARWORK && w.key != null )
				self.worksOnHold[w.key] = [];
		}
//		self.workQueue.push(w);
//		_debug("Pushed new work #"+w.id);

	});
	self.requests[rid].workCount = items.length;

	_debug("Pushed "+workIDs.length+" new works");

	return workIDs;

}


// Client accepted work

function _clientAcceptWork(c,works) {

	var
		self = this,
		accepted = { };

	works.forEach(function(id){
		accepted[id] = true;
	});

	for ( var id in c.sentWorks ) {
		if ( c.sentWorks[id] == null )
			continue;
		if ( !accepted[id] )
			continue;

		var
			w = self.works[id];

		if ( w == null )
			continue;

		_debug("Worker accepted work "+w.id+" after "+_nsec(w.pushTime)+"ms");

		w.status = "running";
//		delete c.sentWorks[id];
		c.sentWorks[id] = null;
		self.isClean = false;
	}

}


// Client rejected works

function _clientRejectWork(c,works,m) {

	var
		self = this,
		rejected = { };

	if ( m )
		_debug("WARNING: Worker "+c.id+" REJECTED "+works.length+" works ("+JSON.stringify(works)+"). My idea was: "+parseInt(c.totalSlots+(m.accepted?m.accepted.length:0)+works.length)+", real: ",m.allocation);

	works.forEach(function(id){
		rejected[id] = true;
	});

	for ( var id in c.sentWorks ) {
		if ( c.sentWorks[id] == null )
			continue;
		if ( !rejected[id] )
			continue;
		var
			w = self.works[id],
			r = c.workRanges[id];

		if ( w == null || r == null )
			continue;

//		delete w['status'];
		w.status = "queued";
//		delete w['worker'];
		w.worker = null;
		self._queueUnshift(w);
//		self.workQueue.unshift(w);

//		delete c.sentWorks[id];
		c.sentWorks[id] = null;
//		delete c.works[id];
		c.works[id] = null;
//		delete c.workRanges[id];
		c.workRanges[id] = null;
		self.isClean = false;

		r.used--;
		// FIXME: This we need to see later. If client rejected is because our value of availableSlots was bigger than reality
		c.busySlots--;
		c.availableSlots++;
		self.globalAvailableSlots++;
	}

}

// Give up from client requested works

function _clientGiveupWork(c) {

	var
		self = this,
		allWorks = [],
		byWorker = {},
		guCount = 0,
		abCount = 0;

	for ( var id in c.works ) {
		if ( c.works[id] )
			allWorks.push(id);
	}

	if ( allWorks.length == 0 )
		return;

	_debug("Giving up of client's "+c.id+" work list: ",JSON.stringify(allWorks));

	// Abort all of client works
	self._clientAbortWork(c,allWorks);

	// Affects lists and counting
	// Hash works by worker so we can send an 'abort' message to them
/*
	allWorks.forEach(function(id){
		var
			w = self.works[id];

		if ( w == null )
			return;

		if ( w.worker ) {
			var
				worker = self.clients[w.worker],
				r = worker.workRanges[id];

			if ( byWorker[w.worker] )
				byWorker[w.worker].push(w.id);
			else
				byWorker[w.worker] = [w.id];

			// Affect range and worker lists and countings

//			delete c.works[id];
			worker.works[id] = null;
			if ( worker.sentWorks[id] )
//				delete worker.sentWorks[id];
				worker.sentWorks[id] = null;
//			delete worker.workRanges[id];
			worker.workRanges[id] = null;

			r.used--;
			worker.busySlots--;
			worker.availableSlots++;
			self.globalAvailableSlots++;
			self.globalRunningWorks--;

			abCount++;
		}
		else {
			self._queueRemove(w);
		}

		// Emit abort signal

		self.emit('abort',w,w.worker);

		// Affect lists and countings

		c.works[id] = null;
//		delete c.works[id];
		self.works[id] = null;
//		delete self.works[id];
		self.isClean = false;

		guCount++;
	});

	// Abort works on workers

	for ( var cid in byWorker ) {
		if ( self.clients[cid] == null )
			continue;
		self._command(self.clients[cid],"abort",{ work: byWorker[cid] });
	}
*/
	_debug("Gave up of "+guCount+" works ("+abCount+" aborted). Global availability now is: "+self.globalAvailableSlots);

}


// Send work back to queue (very similar to reject)

function _clientSendBackWork(c) {

	var
		self = this,
		running = [],
		sent = [];

	for ( var id in c.works ) {
		var
			w = c.works[id],
			r = c.workRanges[id];

		if ( w == null || r == null )
			continue;

		// :-)
		c.sentWorks[id] ? sent.push(id) : running.push(id);

		// Emit giveup signal

		self.emit('giveup',w,c);

//		delete w['status'];
		w.status = "queued";
//		delete w['worker'];
		w.worker = null;
		self._queueUnshift(w);

//		delete c.sentWorks[id];
		c.sentWorks[id] = null;
//		delete c.works[id];
		c.works[id] = null;
//		delete c.workRanges[id];
		c.workRanges[id] = null;
		self.isClean = false;

		r.used--;
		c.busySlots--;
		c.availableSlots++;
		self.globalAvailableSlots++;
		self.globalRunningWorks--;
	}

	if ( sent.length > 0 || running.length > 0 )
		_debug("Pushed worker "+c.id+" jobs back to queue again (sent: "+sent.join(',')+"["+sent.length+"], running: "+running.join(',')+"["+running.length+"])");

}


// Finished work

function _clientFinishWork(c,works) {

	var
		self = this,
		count = 0,
		worksByRequester = { },
		allWorks = Array.prototype.slice.call(works, 0);

	// These jobs finish other holding jobs ?
	works.forEach(function(aw){
		var
			w = self.works[aw.id];
		if ( self.worksOnHold[w.key] ) {
			self.worksOnHold[w.key].forEach(function(hw){
				hw.holdedOn = aw.id;
				allWorks.push({id: hw.id, holdedOn: aw.id, result: aw.result,  fake: true});
			});
		}
	});

	// Remove from mine and client lists;
	allWorks.forEach(function(aw){

		var
			w = self.works[aw.id],
			r = c.workRanges[aw.id];

		// Map by requester
		if ( w.requester ) {
			if ( worksByRequester[w.requester] == null )
				worksByRequester[w.requester] = [];
			worksByRequester[w.requester].push({id: w.id, result: aw.result});
		}

		// How much time did it take ?
		if ( w.status == "onhold" )
			_debug("Holding work "+w.id+" finished due to the finishing of work "+aw.holdedOn+", and took "+_nsec(w.pushTime)+" ms to be finished");
		else
			_debug("Comrade "+c.id+" finished work "+aw.id+" after "+_nsec(w.pushTime)+" ms");

		// 'Emit' finish events
		self.emit('finish',w,aw.result);

		// Remove from lists
//		delete self.works[w.id];
		self.works[w.id] = null;
//		delete c.works[w.id];
		self.requests[w.rid].works[w.id] = null;
//		delete self.requests[w.rid].works[w.id];
		self.requests[w.rid].workCount--;
		if ( self.requests[w.rid].workCount == 0 )
			self.requests[w.rid] = null;
		if ( w.status != "onhold" ) {
			c.works[w.id] = null;
//			delete c.works[w.id];
			c.workRanges[w.id] = null;
//			delete c.workRanges[w.id];
			r.used--;
		}

		self.isClean = false;
		count++;

	});

	// Notify requesters and remove from their lists

	for ( var id in worksByRequester ) {
		if ( self.clients[id] ) {
			self._command(self.clients[id],"done",{ work: worksByRequester[id] });

			// Remove from client
			worksByRequester[id].forEach(function(w){
				self.clients[id].works[w.id] = null;
			});
		}
		else {
			if ( 0 ) {
				// Fixme: keepState support missing
			}
		}
	}


	// Update counters

	c.availableSlots		+= count;
	self.globalAvailableSlots	+= count;
	c.busySlots			-= count;
	self.globalRunningWorks		-= count;
	self.finishCount		+= count;

}


// Abort a request
function _clientAbortRequest(c,rid) {

	var
		self = this,
		works = [],
		rv = 0;

	_debug("Aborting comrade "+c.id+" request "+rid+" ...");

	if ( !self.requests[rid] )
		return;

	for ( var id in self.requests[rid].works ) {
		if ( self.requests[rid].works[id] != null )
			works.push(id);
	}

	rv = self._clientAbortWork(c,works);

	_debug("Comrade "+c.id+" request "+rid+" aborted");

	return rv;

} 


// Abort work

function _clientAbortWork(c,works) {

	var
		self	= this,
		ids	= [],
		byWorker = {};

	_debug("Aborting "+works.length+" works from comrade "+c.id+" ...");

	// For each work...
	works.forEach(function(id){
		var
			w;

		if ( typeof id != "string")
			return;

		w = self.works[id];
		if ( !w )
			return;

		if ( w.status == "new" ) {
			// What can i do here ?
		}
		else if ( w.status == "onhold" ) {
			// Remove from holding list
			var holdList = self.worksOnHold[w.key];
			// No hold list ?
			if ( !holdList )
				return;
			for ( var x = 0 ; x < holdList.length ; x++ ) {
				if ( holdList[x].id == w.id ) {
					holdList.splice(x,1);
					break;
				}
			}
		}
		else if ( w.status == "queued" ) {
			// Remove from the queue
			self._queueRemove([w]);
		}
		else if ( w.status == "assigned" || w.status == "running" ) {
			var
				worker = self.clients[w.worker],
				r = worker.workRanges[id];

			// Hash works by worker, so we can cancel them on the worker
			if ( byWorker[w.worker] )
				byWorker[w.worker].push(w.id);
			else
				byWorker[w.worker] = [w.id];

			// Affect range and worker lists and countings
//			delete c.works[id];
			worker.works[id] = null;
			if ( worker.sentWorks[id] )
//				delete worker.sentWorks[id];
				worker.sentWorks[id] = null;
//			delete worker.workRanges[id];
			worker.workRanges[id] = null;

			r.used--;
			worker.busySlots--;
			worker.availableSlots++;
			self.globalAvailableSlots++;
			self.globalRunningWorks--;
		}
		else {
			_debug("Work "+w.id+" is on strange state '"+w.status+"'");
			return;
		}

		// Emit assigntimeout events
		self.emit('abort',w,w.worker);

		// Affect lists and countings
		ids.push(id);
		c.works[id] = null;
//		delete c.works[id];
		self.works[id] = null;
		self.requests[w.rid].works[w.id] = null;
//		delete self.requests[w.rid].works[w.id];
		self.requests[w.rid].workCount--;
		if ( self.requests[w.rid].workCount == 0 )
			self.requests[w.rid] = null;
//		delete self.works[id];
		self.isClean = false;

	});

	// Abort works on workers
	for ( var cid in byWorker ) {
		if ( self.clients[cid] == null )
			continue;
		self._command(self.clients[cid],"abort",{ work: byWorker[cid] });
	}

	_debug("Aborted "+ids.length+"/"+works.length+" works from comrade "+c.id+" ...");

	return ids;

}


// Register a system message

function _clientRegisterSysMessage(c,message) {

	var
		self = this,
		m = {
			oid:		message.id,
			id:		c.id+"/"+message.id,
			received:	new Date().getTime(),
			from:		c,
			to:		message.to,
			content:	message.content,
			sentTo:		0,
			receivedBy:	0
		};

	// Register

	self.sysMessages[m.id] = m;

	// Send it to all the workers
	_debug("Broadcasting system message: ",{id: m.id, from: c.id, content: m.content});

	// Emit locally
	if ( m.to == null || m.to == "MANAGER" )
		self.emit('sysmsg',{from: c.id, content: m.content});

	// Emite remotelly
	for ( var id in self.clients ) {
		if ( self.clients[id] == null || id == c.id || (m.to != null && m.to != id) )
			continue;
		_debug("Sending system message "+m.id+" to client/worker "+id);
		self._command(self.clients[id],"sysmsg",{id: m.id, from: m.from.id, content: m.content});
		m.sentTo++;
	}

	// Sent to nobody ? Done!

	if ( m.sentTo == 0 )
		self._command(c,"answer",{to:"sysmsg", id: m.oid, done: true, sentTo: 0, receivedBy: 0});

}


// Destroy a client

function _clientDestroy(c,subv) {

	var
		self = this;

	// Status

	if ( c.status == "dead" )
		return;
	c.status = "dead";

	// fascist ? :)
	if ( subv )
		_debug("Client "+c.id+" had subversive ideas and was annihilated");
	else
		_debug("Comrade "+c.id+" has disconnected");


	// Put all of his (sent and pending) works on the queue again

	if ( c.type == "worker" )
		self._clientSendBackWork(c);
	else ( c.type == "client" )
		self._clientGiveupWork(c);


	// Clear some things before destroy (we never know..)

	c.workRanges = {};

	// Unregister client offer

	self._clientUnregisterOffer(c);

	c.con.destroy();
//	delete this.workers[c.id];
	this.workers[c.id] = null;
//	delete this.clients[c.id];
	this.clients[c.id] = null;
	self.isClean = false;

}


// Tell things to a client

function _send(c,obj) {
//	console.log(c.id+" < ",JSON.stringify(obj));
	return c.stream.sendMessage(JSON.stringify(obj));
}
function _command(c,command,args) {
	var
		o = args || { };

	this.lastCommand = command;
	o.command = command;
	this._send(c,o);
}
function _answer(c,to,args) {
	args.to = to;
	return this._command(c,"answer",args);
}
function _error(c,error) {
	return this._send(c,{ error: error });
}


// Dispatch work

function _workDistribute() {

	var
		self = this,
		assignCount = 0,
		workerAssigns = { };

	// Nothing to do ?

	if ( self.pendingWorkLoad == 0 ) {
//		_debug("Nothing to do");
		return;
	}

	if ( self.globalAvailableSlots == 0 ) {
		_debug("WARNING: Out of global available slots (and queue size is: "+self.pendingWorkLoad+")");
		return;
	}
	if ( self.wasFull && self.globalAvailableSlots < AVAIL_THRESHOLD ) {
		_debug("WARNING: Global availability ("+self.globalAvailableSlots+") bellow threshold ("+AVAIL_THRESHOLD+"), wait...");
		return;
	}

	// For each priority (higher first)

	Object.keys(self.workQueue).sort(function(a,b){return parseFloat(b)-parseFloat(a)}).forEach(function(priority){

		var
			workQueue =  self.workQueue[priority],
			avHash = {},
			workerRange = {};

		if ( workQueue.length == 0 )
			return;

		// Create availability hash (even with unavailable workers - for showing)

		for ( var cid in self.workers ) {
			if ( self.workers[cid] ) {
				var range = self._clientPriorityRangeFor(self.workers[cid],priority);
				workerRange[cid] = range;
				avHash[cid] = range.limit - range.used;
			}
		}

		_debug("STATUS: [queue size: "+self.pendingWorkLoad+", global availability: "+self.globalAvailableSlots+"]");
		_debug("AVAILABILITY (Priority "+priority+"): ",avHash);

		// Build a table with the available workers and their availability (this will be helpfull)

		var
			avWorkers = {},
			curAvailability = 0;

		for ( var cid in avHash ) {
			if ( avHash[cid] > 0 ) {
				avWorkers[cid] = avHash[cid];
				curAvailability += avHash[cid];
			}
		}

		// While we have work and available workers

		var
			ignored = 0;

		self.wasFull = false;
		while ( workQueue.length > ignored && curAvailability > 0 ) {

			// Pick a work, generate a random number between 0 and globalAvailableSlots and see which is the worker for this number

			var
				w = workQueue[ignored],
				worker;

			// Find a worker to assign this work

			worker = self.workSelectWorker(w,avWorkers,curAvailability);
			if ( !worker ) {
				_debug("WARN: Work "+w.id+" was not assigned and will be ignored !!! Current availability: "+curAvailability+", gas: "+self.globalAvailableSlots);
				ignored++;
				continue;
			}

			_debug("Work "+w.id+" assigned to worker "+worker.id+" after "+_nsec(w.pushTime)+" ms");

			// Take the work from queue

			self.pendingWorkLoad--;
			workQueue.splice(ignored,1);
			curAvailability--;
			avWorkers[worker.id]--;
			if ( avWorkers[worker.id] == 0 )
				delete avWorkers[worker.id];

			assignCount++;
			if ( workerAssigns[worker.id] == null )
				workerAssigns[worker.id] = [];
			workerAssigns[worker.id].push({work: w, range: workerRange[worker.id]});

		}

	});

	if ( self.globalAvailableSlots == 0 )
		self.wasFull = true;

	if ( assignCount == 0 )
		return;

	_debug("Assigned "+assignCount+" work(s) to "+Object.keys(workerAssigns).length+" worker(s). Dispatching...");

	// Dispatch works for each worker

	for ( var id in workerAssigns )
		self._workDispatchClient(workerAssigns[id],self.workers[id]);

	_debug("Dispatched "+assignCount+" work(s)");

	// FIXME: Workaround for avoiding (more or less) the problem of garbage collection on the workQueue object

	if ( self.workQueue.length == 0 )
		self.workQueue = [];

}

function _workSelectWorker(w,avWorkers,curAvailability) {

	var
		self = this,
		randFactor = Math.round(Math.random()*curAvailability),
		count = 0;

	for ( var cid in avWorkers ) {
		count += avWorkers[cid];
		if ( randFactor <= count )
			return self.workers[cid];
	}

	return null;

}

function _workDispatchClient(works,c) {

	var
		self = this,
		worksToSend = [],
		sitem = { };

	// Counters

	c.availableSlots          -= works.length;
	self.globalAvailableSlots -= works.length;
	c.busySlots               += works.length;
	self.globalRunningWorks   += works.length;

	// Change works status and push them to the worker

	works.forEach(function(wr){
		var
			w = wr.work,
			range = wr.range;

		range.used++;

		w.status = "assigned";
		w.worker = c.id;
		if ( w._assignTimeout )
			clearTimeout(w._assignTimeout);

		c.works[w.id] = w;
		c.workRanges[w.id] = range;
		c.sentWorks[w.id] = w;

		sitem = { id: w.id, args: w.args };
		if ( w.timeout )
			sitem.timeout = w.timeout;

		worksToSend.push(sitem);
	});

	// Send to client

	c.status = "sentwork";
	return self._command(c,"push",{work: worksToSend});

}


// Generate new client ID

function _workNewID() {

	var
		d = new Date().getTime().toString(),
		id;

	do {
		id = "W"+d.substr(d.length-6,6) + "R" + Math.floor(Math.random()*1001);
	} while ( this.works[id] != null );

	return id;

}


/*
  Cleanup
 */

 function _cleanupProcess() {

 	if ( this.canCleanup && this.workQueue.length == 0 && !this.isClean )
 		return this._cleanup();

 }

 function _cleanup() {

 	var
 		lists = [this.works,this.clients,this.workers];

 	if ( this.isClean )
 		return;

	_debug("CLEANUP");

	lists.forEach(function(list){
		for ( var k in list ) {
			if ( list[k] == null )
				delete list[k];
		}
	});

 	for ( var id in this.clients ) {
 		var c = this.clients[id];
 		for ( var id in c.sentWorks ) {
 			if ( c.sentWorks[id] == null )
 				delete c.sentWorks[id];
 		}
 		for ( var id in c.works ) {
 			if ( c.works[id] == null )
 				delete c.works[id];
 			if ( c.workRanges[id] == null )
 				delete c.workRanges[id];
 		}
 	}

 	for ( var rid in this.requests ) {
 		if ( this.requests[rid] == null )
 			delete this.requests[rid];
 	}

 	if ( this.workQueue.length == 0 )
		this.workQueue = [];

	if ( global.gc )
		global.gc();

	this.emit('cleanup');

	this.isClean = true;

 }


// Debug

function _debug() {

	if ( !DEBUG )
		return;

	var
		args = Array.prototype.slice.call(arguments, 0);

	args.unshift(_nsec(first).toString());
	console.log.apply(null,args);

}

function _nsec(start) {

	if ( first == null )
		start = first = process.hrtime();

	var
		diff = process.hrtime(start);

	return (diff[0] * 1e9 + diff[1]) / 1000000;

}

// Self object

exports.Manager = Manager;
