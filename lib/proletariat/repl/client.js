"use strict";

var
    expect = require('../expect');


/*
  reply/client - Replicator client
 */

function ReplClient(addr) {

    var
        self = this;

    if ( !addr || !addr.match(/^:(.+):(\d+)$/) )
        throw new Error("Invalid master address: "+addr);

    // Own properties
    self.host = RegExp.$1;
    self.port = RegExp.$2;
    self.status = "new";
    self.connected = false;
    self.connecting = false;

    return this;

};


// Start the replicator
MasterRepl.prototype.start = function(callback) {

    if ( !callback )
        callback = function(){};

    var
        self = this,
        host,
        port;

    // Reset some vars
    self.connecting = true;
    self.retries = 0;

    // Connect
    return self._connect();


// Connect
MasterRepl.prototype._connect = function() {

    // Connect
    self.socket = net.connect({host: self.host, port: self.port}, function(){
        self._debug("Connected to master manager at "+self.address+":"+self.port);
        self.connecting = false;
        self.connected = true;
        self.stream = new MessageStream(self.socket,{format:"string"});
        self.stream.on('message',function(m){   self.onMessage(m);      });
        self.stream.on('error',function(err){   self.onError(err);      });
        self.stream.on('close',function(){      self.onDisconnect();    });
        self.stream.on('end',function(){        self.onDisconnect();    });
        self.emit('connect',self);

        self.status = "wait-hello";
        self.recvTimeout = self.setTimeout(function(){
            self._debug("Timeout while waiting for server hello");
            self.disconnect();
        },2000);
    });
    self.socket.on('connect',function(){
        self._debug("Connected to manager!");
    });
    self.socket.on('error',function(err){
        self._debug("Connection error: ",err);

        if ( self.connecting ) {
            var
                retryIn = self.client.opts.waitRetry || 1000;

            self._debug("Retrying connecting in "+retryIn+" ms");
            setTimeout(function(){
                self.connect();
            },retryIn);
        }
    });

};

module.exports = MasterRepl;