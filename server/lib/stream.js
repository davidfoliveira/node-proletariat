"use strict";

var
	events		= require('events'),
	util		= require('util'),

	MSG_MAXSIZE	= 1024*1024*20;


/*
 * Stream
 *
 * constructor:
 *
 *   new Stream(format[,socket])
 *
 * methods:
 *
 *   - reveiceChunk(chunk)
 *   - sendMessage(message) - only available when socket is passed to the constructor
 *
 * events:
 *
 *   - message(msg)
 *   - error(err)
 *   - close()
 */

function Stream(format,con) {

	var
		self = this;

	self.format = format ? format : "string";
	self.con = con;

	self.status = "header";
	self.headerBuf = new Buffer(4);
	self.headerBufGot = 0;

	self.msgBuf = null;
	self.msgBufGot = 0;
	self.msgBufMissing = 0;
	self.msgBufTotal = 0;
	self.ownBuffer = false;

	// Methods

	self.receiveChunk = streamReceiveChunk;
	self.sendMessage = sendMessage;

	// If has a connection, listen her events

	if ( con ) {
		con.on('data',function(data){ self.receiveChunk(data) });
		con.on('end', function(){ self.emit('close') });
	}

}
util.inherits(Stream, events.EventEmitter);


// Methods

function streamReceiveChunk(data) {

	var
		offset = 0;

	while ( offset < data.length ) {

		if ( this.status == "header" ) {
			// Receive header data
			var
				headerBytes = data.length - offset > (4-this.headerBufGot) ? (4-this.headerBufGot) : data.length-offset;

			data.copy(this.headerBuf,this.headerBufGot,offset,offset+headerBytes);
			this.headerBufGot += headerBytes;
			offset += headerBytes;

			if ( this.headerBufGot == 4 ) {

				this.msgBufTotal = _sizeDataToNum(this.headerBuf);
				this.msgBufMissing = this.msgBufTotal;
				this.msgBufGot = 0;
				this.ownBuffer = false;

				// Message can't be bigger than 2MB

				if ( this.msgBufTotal > MSG_MAXSIZE ) {
					console.log("[stream] Ignoring message because if "+this.msgBufTotal+" bytes long (max is "+MSG_MAXSIZE+")");
					this.emit('error',{ code: "ELARGEMSG", description: "Message too large" },false);
					this.status = "ignoredata";
					break;
				}

//				this.msgBuf = new Buffer(this.msgBufTotal);
				this.status = "data";

			}
			else if ( this.headerBufGot > 4 ) {
				this.emit('error',{ code: "EPROTO", description: "Protocol error #1"},true);
				return;
			}
		}
		else if ( this.status == "ignoredata" ) {
			// We will receive data but ignore it
			var
				ignoreBytes = (data.length-offset < this.msgBufMissing) ? data.length-offset : this.msgBufMissing;

			offset += ignoreBytes;
		}
		else if ( this.status == "data" ) {
			// Receive message data
			var
				dataBytes = (data.length-offset < this.msgBufMissing) ? data.length-offset : this.msgBufMissing;

			if ( this.msgBufGot == 0 )
				this.msgBuf = data.slice(offset,offset+dataBytes);
			else {
				if ( !this.ownBuffer ) {
					var
						tmpBuf = this.msgBuf;

					this.msgBuf = new Buffer(this.msgBufTotal);
					tmpBuf.copy(this.msgBuf,0,0,tmpBuf.length);
					this.ownBuffer = true;
				}
				data.copy(this.msgBuf,this.msgBufGot,offset,offset+dataBytes);
			}

			this.msgBufGot += dataBytes;
			this.msgBufMissing -= dataBytes;
			offset += dataBytes;

			if ( this.msgBufMissing == 0 ) {
				this.status = "header";
				this.headerBufGot = 0;
				this.emit('message', (this.format == "binary") ? this.msgBuf : this.msgBuf.toString('utf8') );
				this.msgBuf = null;
			}
			else if ( this.msgBufMissing < 0 ) {
				this.emit('error',{ code: "EPROTO", description: "Protocol error #2"},true);
				return;
			}
		}

	}

}


/*
  Send a message
 */

function sendMessage(msg) {

	if ( this.con == null )
		throw new Error("For sending messages throw the stream you need to supply the socket connection on the constructor()");

	var
		buf = new Buffer("    "+msg);

//	console.log("buf: ",buf);
	_sizeNumToData(buf.length-4,buf,0);
	this.con.write(buf);

}



/*
  Utils
 */

function _sizeDataToNum(data) {
	return (data[0] << 24) | (data[1] << 16) | (data[2] <<8) | data[3]
}
function _sizeNumToData(num,buf,offset) {
	if ( buf == null )
		buf = new Buffer(4);
	if ( offset == null )
		offset = 0;

	buf[offset+0] = (num >> 24) & 0xff;
	buf[offset+1] = (num >> 16) & 0xff;
	buf[offset+2] = (num >> 8) & 0xff;
	buf[offset+3] = num & 0xff;

	return buf;
}


// Self object

exports.stream = {
	Stream: Stream
};
