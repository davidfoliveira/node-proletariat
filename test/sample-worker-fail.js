#!/usr/bin/env node

var
	Worker	= require('../lib/proletariat').Worker,
	worker	= null,

	opts	= {
		slots: 10,
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

	// OK function

	if ( w.args == "ok" ) {
		handler(null,"Its ok");
	}

	// Fail function

	else if ( w.args == "fail" ) {
		handler(new Error("Failed"),null);
	}

	// Other stuff

	else {
		handler(new Error("Don't know what to do"),null);
	}

});


// System messages

worker.on('sysmsg',function(msg){
	console.log("System message: ",msg);
});
