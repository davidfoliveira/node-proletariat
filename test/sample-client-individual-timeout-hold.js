var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});

// Generate 11 works

proletariat.work([{_key: "sleep", fn: "sleep", sleep: 2}],{timeout:800},function(err,res){
	if ( err )
		console.log("Works1 err: ",err);
	else
		console.log("Works1 res: ",res);
});
proletariat.workIndividual([{_key: "sleep", fn: "sleep", sleep: 1}],{timeout:2000},
	function(err,res){
		if ( err ) {
			console.log("iError running work: ",err);
			return;
		}
		console.log("iResult: ",res);
	},
	function(err,res){
		if ( err ) {
			console.log("iError running work: ",err);
			return;
		}
		console.log("Everything done: ",res);
	}
);
