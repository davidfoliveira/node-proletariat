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

	// Function ? Run it!

	if ( typeof(w.args) == "function" )
		return w.args(handler);


	// Sleep

	if ( w.args.fn == "sleep" ) {
		return setTimeout(function(){
			handler(null,"I was waiting "+w.args.sleep+" seconds");
		}, w.args.sleep*1000);
	}

	// Something else

	else {
		setTimeout(function(){
			handler(null,"THIS IS THE RESULT OF "+w.id+"!")
		},5000);
	}
});


// System messages

worker.on('sysmsg',function(msg){
	console.log("System message: ",msg);
});
