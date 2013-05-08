#!/usr/bin/env node

var
	Agent	= require('./lib/agent').agent.Agent,

	http = require('http'),
	agents	= [],
	slots	= 10;


if ( process.argv.length > 2 )
	slots = parseInt(process.argv[2]);


// New agent

agents.push(new Agent({
	slots: slots,
//	ANSWER_THRESHOLD: 200
}));
agents.forEach(function(agent){
	agent.start();

	agent.on('work',function(w,handler){
//		console.log("Agent "+agent.id+" got this work: ",w);


		if ( typeof(w.args) == "function" ) {
/*
			setTimeout(function(){
				return w.args(handler);
			},1000);
			return;
*/
			return w.args(handler);
		}

		setTimeout(function(){
			handler(null,"THIS IS THE RESULT OF "+w.id+"!")
//			agent.finishWork(w,);
		},5000);
	});
});

