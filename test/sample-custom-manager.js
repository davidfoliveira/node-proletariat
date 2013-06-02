#!/usr/bin/env node

var
	Manager	= require('../lib/proletariat').Manager,
	manager	= new Manager({ DEBUG: true, SACRED_GUARANTEES: false });

// Customize work->worker assign method
/*
manager.workAssignToWorker = function(w,workers,availability) {

	var
		comrades = Object.keys(workers);

	return this.workers[comrades[parseInt(Math.random()*comrades.length)]];

};
*/
// Start

manager.start();
