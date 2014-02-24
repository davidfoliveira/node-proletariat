var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	works = [];

// Generate 10 works

for ( var x = 0 ; x < 10 ; x++ ) {
/*	works.push(function(handler){
		var r = 3+3;
		handler(null,r);
	});
*/
	works.push({fn:"sleep",sleep:1.300+(x/10)});
}

proletariat.workIndividual(works,{timeout:1700},function(err,res){
	if ( err ) {
		console.log("iError running work: ",err);
		return;
	}

	console.log("iResult: ",res);
},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Everything done: ",res);
	process.exit(0);
});
