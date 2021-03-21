var pkgInfo = require('./package.json');
var Service = require('webos-service');
var child_process = require('child_process')

// Register com.yourdomain.@DIR@.service, on both buses
var service = new Service(pkgInfo.name);

service.register("exec", function(message) {
	child_process.exec(message.payload.command, {encoding: "buffer"}, (error, stdout, stderr) => {
		message.respond({
			returnValue: !error,
			error: error,
			stdoutString: stdout.toString(),
			stdoutBytes: stdout.toString("base64"),
			stderrString: stderr.toString(),
			stderrBytes: stderr.toString("base64")
		});
	});
});

service.register("spawn", function(message) {
	var proc = child_process.spawn("/bin/sh", ["-c", message.payload.command]);
	
	proc.stdout.on('data', (data) => {
		message.respond({
			event: "stdoutData",
			stdoutString: data.toString(),
			stdoutBytes: data.toString("base64")
		});
	});
	proc.stderr.on('data', (data) => {
		message.respond({
			event: "stderrData",
			stderrString: data.toString(),
			stderrBytes: data.toString("base64")
		});
	});
	proc.on('close', (code) => {
		message.respond({
			event: "close",
			closeCode: code
		});
	});
	proc.on('exit', (code) => {
		message.respond({
			event: "exit",
			exitCode: code
		});
	});
});

// stub service that emulates luna://com.webos.service.sm/license/apps/getDrmStatus
service.register("getDrmStatus", function(message) {
	message.respond({
		"appId": message.payload.appId,
		"drmType": "NCG DRM",
		"installBasePath": "/media/cryptofs",
		"returnValue": true,
		"isTimeLimited": false
	});
});
