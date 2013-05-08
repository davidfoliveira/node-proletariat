#!/usr/bin/env node

var
//	heapdump = require('heapdump'),
	Manager	= require('./lib/manager').manager.Manager,
	manager	= new Manager();

// Start

manager.start();


// Push work

//manager.on('finish',function(work){
//	console.log("Finished this: ",work);
//});
/*
setInterval(function(){
	manager.pushWork({type: "bla", url: "http://bli/"});
},100);
*/