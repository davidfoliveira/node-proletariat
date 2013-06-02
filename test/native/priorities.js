var
	Manager = require('../../lib/proletariat').Manager,
	m = new Manager();

var
	c1 = {id:1},
	c2 = {id:2},
	c3 = {id:3};

m._clientRegisterOffer(c1,{0:20,2:10});
console.log(m.priorityRanges);
console.log("---");
m._clientRegisterOffer(c2,{0:10,2:10});
console.log(m.priorityRanges);
console.log("---");
m._clientRegisterOffer(c3,{0:0,1:10,2:0});
console.log(m.priorityRanges);
console.log("---");


m.priorityRanges[0].used += 20;
m.priorityRanges[1].used += 10;
m.priorityRanges[2].used += 5;
console.log(m.priorityRanges);

console.log("===");

console.log(c1);

//m._clientUnregisterOffer(c3);
//m._clientUnregisterOffer(c1);
//m._clientUnregisterOffer(c2);
//console.log(m.priorityRanges);
process.exit(0);
