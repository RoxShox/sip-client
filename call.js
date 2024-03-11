function loadPage() {
	console.log("on loadPage")

	$("#loginText").val(localStorage.getItem("login"))
	$("#passwordText").val(localStorage.getItem("pwd"))
	$("#callNumberText").val(localStorage.getItem("callNumber"))

	this._soundsControl = document.getElementById("sounds")
	this.logOutButton.classList.add("hide")
}

function login() {
	console.log("on login")
	this.loginText = $("#loginText")
	this.passwordText = $("#passwordText")
	this.loginButton = $("#loginButton")
	this.logOutButton = $("#logOutButton")
	this.callButton = $("#callNumberButton")
	this.hangUpButton = $("#hangUpButton")

	localStorage.setItem("login", this.loginText.val())
	localStorage.setItem("pwd", this.passwordText.val())

	socket = new JsSIP.WebSocketInterface("wss://voip.uiscom.ru/ws")
	_ua = new JsSIP.UA({
		uri: "sip:" + this.loginText.val() + "@voip.uiscom.ru",
		password: this.passwordText.val(),
		display_name: this.loginText.val(),
		sockets: [socket],
	})

	this._ua.on("connecting", () => {
		console.log("UA connecting")
	})

	this._ua.on("connected", () => {
		console.log("UA connected")
	})

	this._ua.on("registered", () => {
		console.log("UA registered")

		this.loginButton.addClass("d-none")
		this.logOutButton.removeClass("d-none")
		this.loginText.prop("disabled", true)
		this.passwordText.prop("disabled", true)
		this.logOutButton.addClass("show")
		$("#callPanel").removeClass("d-none")
	})

	this._ua.on("unregistered", () => {
		console.log("UA unregistered")
	})

	this._ua.on("registrationFailed", (data) => {
		console.error("UA registrationFailed", data.cause)
	})

	// заводим шарманку
	this._ua.start()
	this.callButton[0].disabled
	call()
}

function logout() {
	console.log("on logout")

	this.loginButton.removeClass("d-none")
	this.logOutButton.addClass("d-none")
	this.loginText.prop("disabled", false)
	this.passwordText.prop("disabled", false)

	$("#callPanel").addClass("d-none")

	// закрываем всё
	this._ua.stop()
}

function hangUp() {
	this.session.terminate()
	JsSIP.Utils.closeMediaStream(this._localClonedStream)
}

function playSound(soundName, loop) {
	this._soundsControl.pause()
	this._soundsControl.currentTime = 0.0
	this._soundsControl.src = "sounds/" + soundName
	this._soundsControl.loop = loop
	this._soundsControl.play()
}

function stopSound() {
	this._soundsControl.pause()
	this._soundsControl.currentTime = 0.0
}

function call() {
	const historyCallWrap = document.querySelector(".call__history-wrap")
	const callBtn = document.querySelector("#callNumberButton")
	let timer = document.getElementById("timer")
	const callStatus = document.querySelector(".call__status")

	let seconds = 0
	let minutes = 0
	let hours = 0
	let interval

	historyCallWrap.addEventListener("click", callHistoryNum)

	function updateTime() {
		seconds++
		if (seconds === 60) {
			minutes++
			seconds = 0
		}
		if (minutes === 60) {
			hours++
			minutes = 0
		}
		timer.textContent = `${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
	}
	// создаём номер в истории вызовов
	function createHistoryNum(number) {
		const div = document.createElement("div")
		const img = document.createElement("img")
		img.src = "../img/call.svg"
		div.classList.add("call__history-item")
		div.textContent = number
		div.append(img)
		historyCallWrap.prepend(div)
	}

	// вызов номер из истории
	function callHistoryNum(e) {
		if (e.target.closest(".call__history-item") || e.target.tagName == "IMG") {
			const historyNumValue =
				e.target.textContent ||
				e.target.closest(".call__history-item").textContent
			callNumber(e, historyNumValue)
		}
	}

	callBtn.addEventListener("click", callNumber)

	// очищения эффектов при завершение вызова
	function callEnded() {
		callStatus.textContent = "Статус звонка: Звонок завершен"
		clearInterval(interval)
		setTimeout(() => {
			clearInterval(interval)
			seconds = 0
			minutes = 0
			hours = 0
			timer.textContent = "00:00:00"
			timer.classList.remove("show")
			timer.classList.add("hide")
			$(".call__user")[0].innerText = ""
			callStatus.textContent = ""
		}, 2000)
		$("#callNumberButton").css({ display: "flex" })
		$("#hangUpButton").css({ display: "none" })
	}

	// Вызываем абонента
	function callNumber(e, value = "") {
		let inputNumValue = $("#num").val()
		if (value == "" && inputNumValue == "") {
			return
		}

		const number = inputNumValue === "" ? value : inputNumValue
		createHistoryNum(number)
		callUser(number)
		$(".call__user")[0].innerText = `Вы звоните по номеру:${number}`
		$("#callNumberButton").css({ display: "none" })
		$("#hangUpButton").css({ display: "flex" })

		inputNumValue = ""
	}

	// логика вызова
	function callUser(number) {
		console.log(number)
		console.log("звонок пошел")
		this.session = this._ua.call(number, {
			pcConfig: {
				hackStripTcp: true, // Важно для хрома, чтоб он не тупил при звонке
				rtcpMuxPolicy: "negotiate", // Важно для хрома, чтоб работал multiplexing.
				iceServers: [],
			},
			mediaConstraints: {
				audio: true, // Поддерживаем только аудио
				video: false,
			},
			rtcOfferConstraints: {
				offerToReceiveAudio: 1, // Принимаем только аудио
				offerToReceiveVideo: 0,
			},
		})

		this.session.on("connecting", () => {
			console.log("UA session connecting")
			playSound("ringback.ogg", true)

			// Тут мы подключаемся к микрофону и цепляем к нему поток
			let peerconnection = this.session.connection
			let localStream = peerconnection.getLocalStreams()[0]

			// Handle local stream
			if (localStream) {
				// Clone local stream
				this._localClonedStream = localStream.clone()

				console.log("UA set local stream")

				let localAudioControl = document.getElementById("localAudio")
				localAudioControl.srcObject = this._localClonedStream
			}

			// Как только нам отдаётся нам поток абонента, мы его засовываем к себе в наушники
			peerconnection.addEventListener("addstream", (event) => {
				console.log("UA session addstream")

				let remoteAudioControl = document.getElementById("remoteAudio")
				remoteAudioControl.srcObject = event.stream
			})
		})

		// В процессе дозвона
		this.session.on("progress", () => {
			callStatus.textContent = "Статус звонка: Ожидание ответа"
			console.log("UA session progress")
			playSound("ringback.ogg", true)
		})

		// Дозвон завершился неудачно, например, абонент сбросил звонок
		this.session.on("failed", (data) => {
			console.log("UA session failed")
			callEnded()
			stopSound("ringback.ogg")
			playSound("rejected.mp3", false)
		})

		// Поговорили, разбежались
		this.session.on("ended", () => {
			console.log("UA session ended")
			callStatus.textContent = "Статус звонка: Завершен"
			callEnded()
			playSound("rejected.mp3", false)
			JsSIP.Utils.closeMediaStream(this._localClonedStream)
		})

		// Звонок принят, моно начинать говорить
		this.session.on("accepted", () => {
			console.log("UA session accepted")
			interval = setInterval(updateTime, 1000)
			timer.classList.remove("hide")
			timer.classList.add("show")
			callStatus.textContent = "Статус звонка: В процессе"
			stopSound("ringback.ogg")
			playSound("answered.mp3", false)
		})
	}
}
