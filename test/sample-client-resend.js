var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1}),

	works = [],
	rcount = 0;

// Generate 10 works

for ( var x = 0 ; x < 5 ; x++ )
	works.push({fn:"sleep",sleep:x});
for ( var x = 5 ; x < 10 ; x++ )
	works.push({fn:"sleep",sleep:10+x});

proletariat.workIndividual(works,{},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Got: ",res);

	rcount++;
	if ( rcount == 5 ) {
		console.log("Restart manager now");
	}

},function(err,res){
	console.log("Res: ",res);
	console.log("Everything done");
});
