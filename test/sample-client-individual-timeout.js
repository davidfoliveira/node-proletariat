var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	works = [];

// Generate 10 works

for ( var x = 0 ; x < 10 ; x++ ) {
	works.push({fn:"sleep",sleep:1.300+(x/10)});
}

proletariat.workIndividual(works,{timeout:2000},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Result: ",res);
//	process.exit(0);
},function(err,res){
	if ( err ) {
		console.log("Error: ",err);
		return;
	}
	console.log("Everything done");
});
setTimeout(function(){
	process.exit(0);
},5000);
