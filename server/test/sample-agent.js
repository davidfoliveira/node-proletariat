#!/usr/bin/env node

var
	Agent	= require('../lib/proletariat').Agent,
	agent	= null,

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



// New agent

agent = new Agent(opts);

// Start it

agent.start();


// On new work request

agent.on('work',function(w,handler){
//	console.log("Agent "+agent.id+" got this work: ",w);

	// Function ? Run it!

	if ( typeof(w.args) == "function" )
		return w.args(handler);

	// Not a function

	setTimeout(function(){
		handler(null,"THIS IS THE RESULT OF "+w.id+"!")
	},5000);
});

