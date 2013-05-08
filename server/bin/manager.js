#!/usr/bin/env node

var
	Manager	= require('../lib/proletariat').Manager,
	manager	= new Manager();

// Start

manager.start();
