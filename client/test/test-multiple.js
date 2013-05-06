var
	Proletariant	= require('../lib/proletariat-client').Client;
	proletariat	= new Proletariant("127.0.0.1");



proletariat.work([{bla: true},{ble: true}],function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Result: ",res);
});
proletariat.work({bli: true},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Result: ",res);
});