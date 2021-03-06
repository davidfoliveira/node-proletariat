#!/usr/bin/env node

var
	Worker	= require('../lib/proletariat').Worker,
	worker	= null,

	opts	= {
		slots: 30,
		prioritySlots: {
			1: 10,		/* 10 slots for priority >= 1 */
			2: 5,		/* 5 slots for priority >= 2 */
		},
		host: "127.0.0.1"
	};


// Slot number

if ( process.argv.length > 2 )
	opts.slots = parseInt(process.argv[2]);

// Manager host

if ( process.argv.length > 3 )
	opts.host = process.argv[3];



// New worker

worker = new Worker(opts);

// Start it

worker.start();


// On new work request

worker.on('work',function(w,handler){
//	console.log("Worker "+worker.id+" got this work: ",w);

	// Function ? Run it!

	if ( typeof(w.args) == "function" )
		return w.args(handler);

	// Not a function

	setTimeout(function(){
		handler(null,"THIS IS THE RESULT OF "+w.id+"!")
	},5000);
});
