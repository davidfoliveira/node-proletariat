var
	Manager = require('../lib/proletariat').Manager,
	m1, m2, m3;

m1 = new Manager({port:1920,DEBUG:true});
m2 = new Manager({port:1921,DEBUG:true});
m3 = new Manager({port:1922,DEBUG:true});
[m1,m2,m3].forEach(function(m){m.start();});
