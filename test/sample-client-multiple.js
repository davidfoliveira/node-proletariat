var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),
	done		= 0;

proletariat.work([{bla: true},{ble: true}],function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}
	console.log("Result: ",res);
	if ( ++done == 2 )
		process.exit(0);
});
proletariat.work({bli: true},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}
	console.log("Result: ",res);
	if ( ++done == 2 )
		process.exit(0);
});
