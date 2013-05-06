var
	Proletariant	= require('../lib/proletariat-client').Client;
	proletariat	= new Proletariant("127.0.0.1"),

	start		= new Date();


proletariat.work(
	function(handler){
		var r = 2+2;
		handler(null,r);
	},
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}
		var spent = (new Date()).getTime() - start;
		var c = 0;
		var finished = 0;

//		console.log("Result: ",res);
//		console.log("Spent: "+spent+"ms");

		var i = setInterval(function(){
			if ( c++ >= 100 ) {
				clearInterval(i);
				return;
			}

			var start = new Date();
			proletariat.work(
				function(handler){
					var r = 3+3;
					handler(null,r);
				},
				function(err,res,w) {
					if ( err ) {
						console.log("Error running work 2: ",err);
						return;
					}
					var spent = (new Date()).getTime() - start;

//					console.log("Result: ",res);
					console.log("spent:\t"+spent+"ms");
					if ( ++finished >= 100 )
						process.exit(0);
				}
			);
		},0);

	}
);
