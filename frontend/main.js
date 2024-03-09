var appinfos = [
  {
    id: "com.example.foobar",
    title: "Example Name",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.blah",
    title: "Blah Blah",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.abc",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.def",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.123",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.456",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.789",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.zed",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  },
  {
    id: "com.example.bbbb",
    title: "Foo Bar",
    appDescription: "App Description",
    vendor: "Example Vendor",
    version: "v0.01",
    icon: "http://placekitten.com/64/64"
  }
];

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function randFloat(a, b) {
  return a + (Math.random()*(b-a));
}

function do_app_modal(appinfo) {
  window.location.hash = "#appinfo-" + appinfo.id;
  render_appinfo_modal_dom(appinfo);
}

function close_app_modal() {
  var modal_container = document.getElementsByClassName("app-modal")[0];
  modal_container.innerHTML = "";
  modal_container.style.display = "none";
}

function render_appinfo_modal_dom(appinfo) {
  var modal_container = document.getElementsByClassName("app-modal")[0];
  modal_container.innerHTML = "";

  modal_container.addEventListener("click", function(e) {
    if (e.target == modal_container) {
      close_app_modal();
    }
  });

  var modal_div = document.createElement("div");
  modal_container.appendChild(modal_div);

  var modal_header = document.createElement("div");
  modal_header.classList.add("app-modal-header");
  modal_div.appendChild(modal_header);

  var app_img =  document.createElement("img");
  app_img.src = appinfo.icon;
  modal_header.appendChild(app_img);

  var app_butt =  document.createElement("button");
  app_butt.addEventListener("click", function() {
    alert("TODO: install app :P");
    logmsg("Error logging test: installed " + appinfo.id);
    close_app_modal(); // TODO
  });
  app_butt.innerText = "Install";
  modal_header.appendChild(app_butt);

  var app_title = document.createElement("h2");
  app_title.innerText = appinfo.title;
  modal_header.appendChild(app_title)

  var app_author = document.createElement("p");
  app_author.innerHTML = "<strong>Developer:</strong>"
  app_author.insertAdjacentText("beforeend", appinfo.vendor);
  modal_header.appendChild(app_author);

  var app_version = document.createElement("p");
  app_version.innerHTML = "<strong>Version:</strong>"
  app_version.insertAdjacentText("beforeend", appinfo.version);
  modal_header.appendChild(app_version);

  var desctitle = document.createElement("h3");
  desctitle.innerText = "Description:";
  modal_div.appendChild(desctitle);

  var desc = document.createElement("p");
  desc.innerText = appinfo.appDescription;
  modal_div.appendChild(desc);

  modal_container.style.display = "block";
  console.log("foo");
}

function render_appinfo_dom(appinfo)
{
  var card = document.createElement("li");
  var cardbutt = document.createElement("button");

  cardbutt.addEventListener("click", function(e) {
    do_app_modal(appinfo);
  });

  var cardimg =  document.createElement("img");
  cardimg.src = appinfo.icon;
  cardbutt.appendChild(cardimg);

  var cardtitle = document.createElement("h3");
  cardtitle.innerText = appinfo.title;

  var cardauthor = document.createElement("span");
  cardauthor.innerHTML = " &mdash; ";
  cardauthor.innerText += appinfo.vendor;
  cardtitle.appendChild(cardauthor);

  cardbutt.appendChild(cardtitle);

  var carddesc = document.createElement("p");
  carddesc.innerText = appinfo.appDescription;
  cardbutt.appendChild(carddesc);

  card.appendChild(cardbutt)
  return card;
}

function render_applist()
{
  var applist = document.getElementsByClassName("applist")[0].children[0];
  var query = document.getElementsByClassName("searchbox")[0].value.toLowerCase();;
  applist.innerHTML = "";

  appinfos.forEach(function(appinfo){
    if (appinfo.title.toLowerCase().includes(query) || appinfo.appDescription.toLowerCase().includes(query)) {
      applist.appendChild(render_appinfo_dom(appinfo));
    }
  });
}


window.onload = function()
{
  console.log("loaded");

  var bubbles = document.getElementsByClassName("bubbles")[0];
  for (var i=0; i<100; i++) {
    var bubble = document.createElement("div");
    var scale = randFloat(0.4,1);
    bubble.classList.add("bubble");
    bubble.style.left = getRandomInt(1280) + "px";
    bubble.style.animation = "bubbleup "+(randFloat(3,6)/scale)+"s cubic-bezier(.53,.14,.91,.44) infinite, bubblewobble "+randFloat(2,3)+"s ease-in-out infinite";
    bubble.style["animation-delay"] = randFloat(0,3)+"s";
    bubble.style.transform = "scale("+scale+")";
    bubbles.appendChild(bubble);
  }

  var searchBox = document.getElementsByClassName("searchbox")[0];

  searchBox.addEventListener("input", function(e) {
    console.log(e.target.value);
    render_applist();
  });

  render_applist();
}

function logmsg(str) {
  document.getElementById("log-window").innerText += str + "\n";
}

window.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
  logmsg("[!] JS Error on line " + lineNumber + ": " + errorMsg);
  return false;
}

window.onhashchange = function() {
  if (window.location.hash == "") {
    close_app_modal();
  }
}
