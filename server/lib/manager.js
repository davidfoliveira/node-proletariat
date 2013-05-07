"use strict";

var
	events		 = require('events'),
	util		 = require('util'),
	net		 = require('net'),
	Stream		 = require('./stream').stream.Stream,

	AVAIL_THRESHOLD	 = 500,
	CLEANUP_REQS	 = 10000,
	CLEANUP_CHECKINT = 60000,

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

function Manager() {

	var
		self = this;

	// Properties

	this.s = null;
	this.workQueue = [];
	this.works = { };
	this.clients = { };
	this.agents = { };
	this.globalAvailableSlots = 0;
	this.finishCount = 0;
	this.canCleanup = false;
	this.isClean = true;

	// Methods

	this.start = managerStart;
	this.stop = managerStop;
	this._workNewID = _workNewID;
	this._workDistribute = _workDistribute;
	this._workDispatchClient = _workDispatchClient;
	this._clientInit = _clientInit;
	this._clientDestroy = _clientDestroy;
	this._clientNewID = _clientNewID;
	this._clientMessage = _clientMessage;
	this._clientPushWork = _clientPushWork;
	this._clientAcceptWork = _clientAcceptWork;
	this._clientRejectWork = _clientRejectWork;
	this._clientFinishWork = _clientFinishWork;
	this._cleanup = _cleanup;
	this._cleanupProcess = _cleanupProcess;
	this._send = _send;
	this._command = _command;
	this._answer = _answer;

	this._cleanupInterval = setInterval(function(){self._cleanupProcess()},CLEANUP_CHECKINT);

}
util.inherits(Manager, events.EventEmitter);


// Start manager

function managerStart() {

	var
		self = this;

	this.s = net.createServer(function(con){ self._clientInit(con) });
	this.s.listen(1917, function(){
		_debug("Listening");
	});

}

// Stop manager

function managerStop() {

	s.close();
	s = null;
	_debug("остановившийся!");

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


// Handle client initialization

function _clientInit(con) {

	var
		self = this,
		c;

	con._id = this._clientNewID();
	c = this.clients[con._id] = {
		id: con._id,
		con: con,
		connectTime: new Date(),

		// Stream

		stream: new Stream("string",con),

		// High level stuff

		status: "new",
		type: "unknown",
		availableSlots: 0,
		busySlots: 0,
		works: {},
		sentWorks: {}
	};
	con.on('error',function(err){
		_debug("Client "+c.id+" connection error: ",err);
	});
	c.stream.on('message',function(msg){
		self._clientMessage(c,msg);
	});
	c.stream.on('close',function(){
		self._clientDestroy(c);
	});
	c.stream.on('error',function(err,cantRecover){
		_error(c,err);
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


	// Offer command

	if ( m.command == "offer" ) {

		if ( c.status != "new" )
			return self._answer(c,"offer",{ error: { code: "EINVCMDSTAT1", description: "You are not new here." } });

		if ( typeof(m.slots) != "number" || m.slots <= 0 )
			return self._answer(c,"offer",{ error: { code: "EINVSLOTNR", description: "Invalid/Unexistent slot number" } });

		c.status = "available";
		c.type = "agent";
		self.agents[c.id] = c;
		c.availableSlots = m.slots;
		self.globalAvailableSlots += m.slots;

		_debug("Comrade "+c.id+" offered "+m.slots+" work slots. He will be considered an agent");
		self._answer(c,"offer",{ description: "You are very nice comrade", you: c.id });

		return setTimeout(function(){ self._workDistribute(); },parseInt(Math.random()*100));
//		return process.nextTick(function(){ self._workDistribute(); });

	}
	else if ( m.command == "push" ) {

		if ( !(m.work instanceof Array) || m.work.length == 0 )
			return self._answer(c,"push",{ error: { code: "EINVWORKL", description: "Invalid work list" } });

		c.type = "client";

		var ids = self._clientPushWork(c,m.work);
		_debug("Client "+c.id+" pushed this work: ",ids);

		self._answer(c,"push",{ work: ids });
		return setTimeout(function(){ self._workDistribute(); },parseInt(Math.random()*100));
//		return process.nextTick(function(){ self._workDistribute(); });

	}
	else if ( m.command == "done" ) {

		if ( c.status == "new" )
			return self._answer(c,"done",{ error: {code: "EINVCMDSTAT2", description: "You are a new comrade. You had not work"} });
		if ( c.busySlots == 0 )
			return self._answer(c,"done",{ error: {code: "EINVSTAT1", description: "You had no work"} });
		if ( !m.work || !(m.work instanceof Array) )
			return self._answer(c,"done",{ error: {code: "EINVWORKL", description: "Invalid work list"} });

		var
			finishedWorks = [];

		m.work.forEach(function(aw){
			if ( typeof(aw) != "object" || !aw.id || !aw.result || !self.works[aw.id] || self.works[aw.id].status != "running" )
				return;

			_debug("Comrade "+c.id+" finished work after "+_nsec(self.works[aw.id].pushTime)+"ms: "+aw.id);
			finishedWorks.push(aw);
		});

		if ( finishedWorks.length > 0 ) {
			self._clientFinishWork(c,finishedWorks);
			self._answer(c,"done",{ description: "спасибо for the "+finishedWorks.length+" works" });
		}
		else
			self._answer(c,"done",{ description: "You didn't send nothing interesting sir" });

		// Distribute!

		setTimeout(function(){ self._workDistribute(); },parseInt(Math.random()*100));
//		process.nextTick(function(){ self._workDistribute(); });

		// Cleanup

		if ( (++self.finishCount % CLEANUP_REQS) == 0 ) {
			self.finishCount = 0;
			self._cleanup();
		}
		else {
			if ( self.workQueue.length == 0 )
				self.canCleanup = true;
		}

		return;

	}
	else if ( m.command == "ping" ) {
		return self._answer(c,"ping",{ current: new Date() });
	}
	else if ( m.command == "mystatus" ) {
		return self._command(c,"answer",{
			to: "status",
			id: c.id,
			connected: c.connectTime,
			current: new Date(),
			status: c.status,
			availableSlots: c.availableSlots
		});
	}
	else if ( m.command == "status" ) {

		var
			agents = [],
			clients = [];

		for ( var id in self.clients ) {
			var
				cl = self.clients[id],
				item;
			if ( cl == null )
				continue;

			item = {id: id, status: cl.status};

			if ( cl.id == c.id )
				item.you = true;

			if ( cl.type == "agent" ) {
				item.availableSlots = cl.availableSlots;
				item.busySlots = cl.busySlots;
				agents.push(item);
			}
			else
				clients.push(item);
		}

		return self._command(c,"answer",{
			to:			"status",
			queueSize:		self.workQueue.length,
			globalAvailableSlots:	self.globalAvailableSlots,
			canCleanup:		self.canCleanup,
			isClean:		self.isClean,
			finishCount:		self.finishCount,
			agents:			agents,
			clients:		clients
		});

	}
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
	else if ( m.command == "cleanup" ) {
		self._cleanup();
		self._command(c,"cleanup",{ok: true});
		return;
	}
	else if ( m.command == "gc" ) {
		global.gc();
		self._command(c,"gc",{ok: true});
		_debug("GARBAGE COLLECTOR");
		return;
	}
	else if ( m.command == "answer" ) {

		if ( m.to == "push" ) {

//			_debug("Answer to push: ",m);
			// Rejected some work ?

			if ( m.rejected instanceof Array && m.rejected.length > 0 )
				self._clientRejectWork(c,m.rejected,m);

			// Accepted some work ?

			if ( m.accepted instanceof Array && m.accepted.length > 0 )
				self._clientAcceptWork(c,m.accepted);

		}
		else
			return _error(c, {code: "EUNKNANDT", description: "Unknown answer type" });

		return;

	}

	return _error(c,{ code: "EUNKNCMD", description: "Unknown command", command: m.command });

}


// Client pushed work

function _clientPushWork(c,items) {

	var
		self = this,
		workIDs = [];

	items.forEach(function(item){

		// Create work

		var
			w = {
				id: self._workNewID(),
				args: item,
				requester: c.id,
				pushTime: process.hrtime()
			};

		workIDs.push(w.id);
		self.works[w.id] = w;
		self.workQueue.push(w);
		_debug("Pushed new work #"+w.id);

	});

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

//		_debug("Accepted work "+w.id+" after "+_nsec(w.pushTime)+"ms");

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
		_debug("WARNING: Agent "+c.id+"REJECTED "+works.length+" works ("+JSON.stringify(works)+"). My idea was: "+parseInt(c.availableSlots+m.accepted.length+works.length)+", real: ",m.allocation);

	works.forEach(function(id){
		rejected[id] = true;
	});

	for ( var id in c.sentWorks ) {
		if ( c.sentWorks[id] == null )
			continue;
		if ( !rejected[id] )
			continue;
		var
			w = self.works[id];

		if ( w == null )
			continue;

//		delete w['status'];
		w.status = null;
//		delete w['agent'];
		w.agent = null;
		self.workQueue.unshift(w);

//		delete c.sentWorks[id];
		c.sentWorks[id] = null;
//		delete c.works[id];
		c.works[id] = null;
		self.isClean = false;
		// FIXME: This we need to see later. If client rejected is because our value of availableSlots was bigger than reality
		c.busySlots--;
		c.availableSlots++;
	}

}


// Finished work

function _clientFinishWork(c,works) {

	var
		self = this,
		count = 0,
		worksByRequester = { };

	// Remove from mine and client lists;

	works.forEach(function(aw){
		var
			w = self.works[aw.id];

		if ( w == null )
			return;

		// Map by requester

		if ( w.requester ) {
			if ( worksByRequester[w.requester] == null )
				worksByRequester[w.requester] = [];
			worksByRequester[w.requester].push({id: w.id, result: aw.result});
		}

		// How much time did it take ?

		_debug("Work #"+w.id+" took "+_nsec(w.pushTime)+"ms to be finished");

		// Emit finish events

		self.emit('finish',w.id,aw.result);
//		delete self.works[w.id];
		self.works[w.id] = null;
//		delete c.works[w.id];
		c.works[w.id] = null;
		self.isClean = false;
		count++;
	});

	// Notify requesters

//	_debug("Works by requester: ",worksByRequester);
	for ( var id in worksByRequester ) {
		if ( self.clients[id] ) {
//			worksByRequester[id].forEach(function(w){
//				_debug("Notifying "+self.clients[id].id+" about work "+w.id);
//			});
			self._command(self.clients[id],"done",{ work: worksByRequester[id] });
		}
	}

	// Update counters

	c.availableSlots += count;
	c.busySlots -= count;
	self.globalAvailableSlots += count;

}


// Destroy a client

function _clientDestroy(c,subv) {

	var
		self = this;

	// fascist ? :)
	if ( subv )
		_debug("Client "+c.id+" had subversive ideas and was annihilated");
	else
		_debug("Comrade "+c.id+" has disconnected");


	// If we sent works for him that he didn't accept, act like he rejected them

	var
		sentWorks = [];

	for ( var id in c.sentWorks )
		sentWorks.push(id);
	if ( sentWorks.length > 0 )
		self._clientRejectWork(c,sentWorks);

	// If he had pending works, put them again on the queue

	var
		pendingWorks = [];

	for ( var id in c.works ) {
		if ( c.works[id] )
			pendingWorks.push(id);
	}

	if ( pendingWorks.length > 0 ) {
		_debug("  he had these works:",pendingWorks);
		_debug("  putting them again on the (start of the) queue");

		for ( var id in c.works ) {
			if ( c.works[id] != null )
				self.workQueue.unshift(c.works[id]);
		}
	}

	// Update records

	self.globalAvailableSlots -= c.availableSlots;


	c.con.destroy();
//	delete this.agents[c.id];
	this.agents[c.id] = null;
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
function _ok(c) {
	return _send(c,{ ok: true });
}
function _error(c,error) {
	return _send(c,{ error: error });
}


// Dispatch work

function _workDistribute() {

	var
		self = this,
		assignCount = 0,
		agentAssigns = { },
		agentAssignCount = { };

	// Nothing to do ?

	if ( self.workQueue.length == 0 ) {
//		_debug("Nothing to do");
		return;
	}

	if ( self.globalAvailableSlots == 0 ) {
//		_debug("WARNING: Out of global available slots (and queue size is: "+self.workQueue.length+")");
		return;
	}
	if ( self.globalAvailableSlots < AVAIL_THRESHOLD ) {
//		_debug("WARNING: Global availability ("+self.globalAvailableSlots+") bellow threshold ("+AVAIL_THRESHOLD+"), wait...");
		return;
	}

	var avHash = {};
	for ( var id in self.agents ) {
		if ( self.agents[id] )
			avHash[id] = self.agents[id].availableSlots;
	}


	_debug("STATUS: [queue size: "+self.workQueue.length+", global availability: "+self.globalAvailableSlots+"]");
	_debug("AVAILABILITY: ",avHash);

	// While we have work and available workers

	while ( self.workQueue.length > 0 && assignCount < self.globalAvailableSlots ) {
		_debug("Distribute "+self.workQueue.length+", assignCount: "+assignCount+", gas: "+self.globalAvailableSlots);

		// Pick a work, generate a random number between 0 and globalAvailableSlots and see which is the agent for this number

		var
			w = self.workQueue.shift(),
			randFactor = Math.round(Math.random()*(self.globalAvailableSlots-assignCount)),
			count = 0,
			assigned = null;

		for ( var cid in self.agents ) {
			var
				c = self.agents[cid],
				av = 0;

			if ( c == null )
				continue;

			// Get client availability, counting with the jobs that we already assinged to him

			av = (agentAssigns[c.id] == null) ? c.availableSlots : c.availableSlots - agentAssignCount[c.id];
			if ( av == 0 )
				continue;

			count += av;
			if ( randFactor <= count ) {
//				console.log(w);

				_debug("Work "+w.id+" assigned to agent "+c.id+" after "+_nsec(w.pushTime)+"ms");

				if ( agentAssigns[c.id] == null ) {
					agentAssigns[c.id] = [];
					agentAssignCount[c.id] = 0;
				}
				agentAssigns[c.id].push(w);
				agentAssignCount[c.id]++;
				assigned = c;
				assignCount++;
				break;
			}
		}
		if ( !assigned )
			_debug("ERROR: Work "+w.id+" was not assigned!!! Assign count: "+assignCount+", gas: "+self.globalAvailableSlots);
	}

	// Dispatch works for each agent

	for ( var id in agentAssigns )
		self._workDispatchClient(self.agents[id],agentAssigns[id]);

	// FIXME: Workaround for avoiding (more or less) the problem of garbage collection on the workQueue object

	if ( self.workQueue.length == 0 )
		self.workQueue = [];

}

function _workDispatchClient(c,works) {

	var
		self = this,
		delFromQueue = {},
		worksToSend = [];

	// Dispatch the work

	self.globalAvailableSlots -= works.length;
	c.availableSlots -= works.length;
	c.busySlots += works.length;
	works.forEach(function(w){
		w.status = "assigned";
		w.agent = c.id;

		c.works[w.id] = w;
		c.sentWorks[w.id] = w;

		worksToSend.push({id: w.id, args: w.args});
		delFromQueue[w.id] = true;
	});

	// Send to client

	c.status = "sentwork";
	return self._command(c,"push",{work: worksToSend});

}


// Generate new clint ID

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
 		lists = [this.works,this.clients,this.agents];

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
 		}
 	}

 	if ( this.workQueue.length == 0 )
		this.workQueue = [];

	if ( global.gc )
		global.gc();

	this.isClean = true;

 }

/*
  Externals
 */



// Debug

function _debug() {

	var
		args = [_nsec(first)];

	for ( var x = 0 ; x < arguments.length ; x++ )
		args.push(arguments[x]);

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

exports.manager = {
	Manager: Manager
};