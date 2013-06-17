var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});


proletariat.systemMessage({"do":"something"},function(){
	console.log("Everybody received the message");
	process.exit(0);
});
