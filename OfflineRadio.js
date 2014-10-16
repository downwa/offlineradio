// Play 3ABN Radio with caching and offline operation (optional)
// By Warren E. Downs
// Copyright 2014
var seekSecs=0;
const sBase="/sdcard/OfflineRadio/";
const contBase=sBase+"Content/";
const scontBase=contBase+"Scheduled/";
const fillBase=contBase+"Filler/";
const schedBase=sBase+"Schedules/";
const logBase=sBase+"Logs/";
const varBase=sBase+"Settings/";
const logPath=logBase+"OfflineRadio.log.txt";
const LOGLIMIT=8192;

var weekCodeCount=new Array(); // Store category code counts for the week
var dayCodeCount=new Array(7); // Store each day's category code counts
var todayCodeUse=new Array(); // Store today's category code uses
var weekSchedule=new Array();
var catWrapCount=new Array(); // How many times each category code "wraps" in year (gets used multiple times)

var curFile="";
var curCategory="";
var fileSet=false;
var fInit=null;
var filesinit=false;
var started=false;

var playing=null;
var logTxt=null;
var playList=null;
var skb=null;
var player=null;
var debug=false;
var categoriesQ=[];
var cachedCategories=[];
var foldersQ=[]; // Queue of folders to be listed
var allFilesInCategory=[];
var newFiles=[];
var newFolder="";
var allFilesOfs=0;
var refreshCount=0;
var saveCacheFile=null;
var lenFile=null;
var saveFiles=[];
var saveFiles2=[];

var filesQ=[]; // Queue of files or folders waiting to be processed
var qStep=0;   // Step in the process (0 signifies no process active)
var lenPlayer_timeout=-1;

//Called when application is started. 
function OnStart() {    
  var lay = app.CreateLayout( "Linear", "FillXY,VCenter" ); // Fill the screen
  lay.SetBackColor("#ff337788");
  
  var layStatus = app.CreateLayout("Linear","Horizontal,Left");
  //var txtS1 = app.CreateText("Status", 0.1, 0.1);
  playing = app.CreateToggle("Status", 0.9, 0.05);
  //layStatus.AddChild(txtS1);
  layStatus.AddChild(playing); 
   
  playList = app.CreateList( "Loading Schedule...", 0.9, 0.4 );
  playList.SetBackColor("#ffddeeff");
  playList.SetTextColor("#ff000000");
  playList.SetTextSize(12);
  //playList.SetOnTouch( lst_OnTouch );
  //playList.SetOnLongTouch( lst_OnLongTouch );
  
  logTxt = app.CreateList("STATUS LOG:",0.9,0.3,"Multiline,Left,Scroll");
  logTxt.SetTextSize(12);
  logTxt.SetBackColor("#ff000000");
  logTxt.SetTextColor("#ffffffff");
  
  skb = app.CreateSeekBar( 0.8, -1 ); 
  skb.SetMargins( 0, 0.05, 0, 0 ); 
  skb.SetRange( 1.0 ); 
  //    skb.SetOnTouch( skb_OnTouch ); 

  //Create volume bar and add to layout. 
  var skbVol = app.CreateSeekBar( 0.8, -1 ); 
  skbVol.SetMargins( 0, 0.05, 0, 0 ); 
  skbVol.SetOnTouch( skbVol_OnTouch ); 
  skbVol.SetRange( 1.0 ); 
  skbVol.SetValue( 0.5 );
  
  lay.AddChild( layStatus );
  lay.AddChild( playList );
  lay.AddChild( logTxt );
  lay.AddChild( skb ); 
  lay.AddChild( skbVol ) 
  app.AddLayout( lay ); 
   
  // Initialize folders and log
  if(!app.FolderExists(sBase))     { app.MakeFolder(sBase); }
  if(!app.FolderExists(scontBase)) { app.MakeFolder(scontBase); }
  if(!app.FolderExists(fillBase))  { app.MakeFolder(fillBase); }
  if(!app.FolderExists(schedBase)) { app.MakeFolder(schedBase); }
  if(!app.FolderExists(varBase))   { app.MakeFolder(varBase); }
  if(!app.FolderExists(logBase))   { app.MakeFolder(logBase); }
  
  // Initialize log
  app.WriteFile(logPath,"OfflineRadio LOG\r\n");
  // Initialize variables
  initVar("debug","false");  

  // Initialize files playback length checker
  lenPlayer = app.CreateMediaPlayer();
  lenPlayer.SetOnReady( lenPlayer_OnReady ); 
  //lenPlayer.SetOnSeekDone( lenPlayer_SeekDone ); 
  lenPlayer.SetOnComplete( lenPlayer_OnComplete );
  
  // Initialize main player
  player = app.CreateMediaPlayer();
  player.SetOnReady( player_OnReady ); 
  player.SetOnSeekDone( player_SeekDone ); 
  player.SetOnComplete( player_OnComplete );
  
  // ********** FINISH INIT IN BACKGROUND ***********  
  setInterval("Update()", 1000); //Start timer to update seek bar every second. 
  qStep=1; // Start the interleaved file Initialization process
  fInit=setInterval("initFiles()", 10); //Start timer to get file lengths. 
}    

//*********** APPLICATION LOGIC **************
function initWeeklySchedules() {
  try {
    log("initWeeklySchedules");
    for(xa=1; xa<=7; xa++) {
      dayCodeCount[xa-1]=new Array();
      var schedFile=schedBase+"Schedule-"+xa+".txt";
      if(!app.FileExists(schedFile)) { log("MISSING SCHEDULE "+schedFile); return null; }
      var sched=app.ReadFile(schedFile);
      weekSchedule[xa]=sched.split('\n');
      
      var schedArr=weekSchedule[xa];
      for(xb=0; xb<schedArr.length; xb++) {
        var line=schedArr[xb].trim();
        if(line.length == 0) { continue; }
        var catcode=line.substring(9);
        // Tally up usage of category
        if(dayCodeCount[xa-1][catcode] == null) { dayCodeCount[xa-1][catcode]=0; }
        dayCodeCount[xa-1][catcode]++;
        if(weekCodeCount[catcode] == null) { weekCodeCount[catcode]=0; }
        weekCodeCount[catcode]++;
        // Make non-existant category folders
        if(!app.FolderExists(scontBase+catcode) && !app.FolderExists(fillBase+catcode)) {
          var dupCategory=(catcode.slice(-1) > 0);
          if(!dupCategory) { app.MakeFolder(scontBase+catcode); }
        }
      }    
    }
  }
  catch(e) { log("initWeeklySchedules: "+e.message); return null; }
  return "OK";
}

function initSchedule() {
  try {
      //Create music list. 
      //mp3List = app.ListFolder( "/sdcard/music", ".mp3" ); 
      //oggList = app.ListFolder("/sdcard/music", ".ogg");
     // return "";
    if(initWeeklySchedules() == null) { return ""; }
    log("initSchedule");
   // return "";
    var now = new Date();
  //  var schedFile = schedBase+"Schedule-"+(d.getDay()+1)+".txt";
  //  var sched = app.ReadFile(schedFile);
    var year=now.getFullYear();
    var month=now.getMonth();
    var day=now.getDate();
    var dayOfWeek=now.getDay();
    var weekOfYear=now.getWeekNumber();
    var schedArr=weekSchedule[dayOfWeek+1]; //sched.split('\n');
    var hh = now.getHours();
    var mm = now.getMinutes();
    var ss = now.getSeconds();
    var secondInDay=hh*3600+mm*60+ss;
    if(hh<10) { hh="0"+hh; }
    if(mm<10) { mm="0"+mm; }
    if(ss<10) { ss="0"+ss; }
    var after=hh+":"+mm+":"+ss;
    //log("Schedule: "+after);
    seekSecs=-1;
    var mediaList="\n\n";
    //mediaList="/sdcard/Download/b/BOL200~BREATH_OF_LIFE~Medicine_and_Magnetism_Pt_1~Walter_Pearson.ogg";  
    for(xa=0; xa<schedArr.length; xa++) {
      var bb=schedArr[xa].substring(0,after.length);
      if(bb < after || xa == 0) { continue; }
      var line=schedArr[xa-1];
      var hhmmss=line.substring(0,8);
      var shh=hhmmss.substring(0,2);
      var smm=hhmmss.substring(3,5);
      var sss=hhmmss.substring(6,8);
      if(seekSecs == -1) {
        var playSecondInDay=shh*3600+smm*60+sss*1;
        seekSecs=secondInDay-playSecondInDay;
        //log("Schedule: "+after+"; "+schedArr[xa-1]+"; seekSecs="+seekSecs);
      }
      var len=parseInt(line.substring(9,13));
      var catcode=line.substring(9).trim();
      //var progDir = scontBase+catcode;
      //if(!app.FolderExists(progDir)) { log("MISSING FOLDER "+progDir); return ""; }
      //var prog = app.ListFolder(progDir); // FIXME         
      var baseCatcode=catcode.replace(/\d$/g,''); // Access specified category or its "parent"
      var progArr = cachedCategories[baseCatcode]; //prog.split(',');
      //log(catcode+" progArr.length was "+progArr.length);
      // **** REMOVE comments and blank lines
      for(xb=0; xb<progArr.length; xb++) {
        if(progArr[xb].substring(0,6) == "PATT: " || progArr[xb] == "") {
          progArr.splice(xb, 1); // Remove item from playlist
          xb--; 
        }
      }
      
      // Record how many times each category code "wraps" in year (gets used multiple times)
      if(catWrapCount[catcode] == null) {
        var yearCatOffset=catOffset+(weekCodeCount[catcode]*52);
        if(yearCatOffset >= progArr.length) { 
          catWrapCount[catcode]=Math.floor(yearCatOffset/progArr.length);
          var repnum=catcode.substring(catcode.length-1);
          if(repnum=='2') { repnum=2; }
          else if(repnum=='4') { repnum=1; }
          else { repnum=4; }
          //log("repnum="+repnum);
          log("WRAPPED "+catcode+" "+catWrapCount[catcode]+" times"+
            (progArr.length%repnum == 0?"":", unevenly")+
            " (catcode="+catcode+": "+yearCatOffset+" > "+progArr.length+")"); 
        }
      }

      //log(catcode+" progArr.length is "+progArr.length);
      var playFile="";
      if(dayCodeCount[dayOfWeek][catcode] == null) { dayCodeCount[dayOfWeek][catcode]=0; }
      if(weekCodeCount[catcode] == null) { weekCodeCount[catcode]=0; }
      if(todayCodeUse[catcode] == null) { todayCodeUse[catcode]=0; }
      var catOffset=weekCodeCount[catcode]*weekOfYear;                        // Start with Used for each week of this year to date
      //if(catcode=='MUSIC') { log('year.catOffset='+catOffset); }
      for(xb=0; xb<dayOfWeek; xb++) {
        if(dayCodeCount[xb][catcode] == null) { dayCodeCount[xb][catcode]=0; }
        catOffset+=dayCodeCount[xb][catcode];
      } // Add Used for each day of this week (not including today)
      //if(catcode=='MUSIC') { log('week.catOffset='+catOffset); }
      catOffset+=todayCodeUse[catcode];                                       // Add Used for today
      //if(catcode=='MUSIC') { log('day.catOffset='+catOffset); }
      catOffset=catOffset % progArr.length;                                   // Wrap around depending on how many items we have
      var ofs=0;
      if(progArr[catOffset] == null) {
        if(progArr.length == 0) { log("NO programs found for category "+catcode); return ""; }
        log("NO programs found for category "+catcode+" at offset "+catOffset); return "";
      }
      //playFile=scontBase+catcode+"/"+progArr[catOffset]; //.substring(5); //+"; catcode="+catcode+"; catoffset="+catOffset+";palen="+progArr.length; 
      playFile=progArr[catOffset].substring(5);
      //log("ADDING playFile="+playFile+"***");     
      var at=dateToHMS(new Date(year, month, day, shh, smm, sss, 0));
      if(app.FileExists(playFile)) {
        mediaList=mediaList+(mediaList!=""?"\n":"")+at+" "+playFile;
      }
      else { log("At "+at+" MISSING "+playFile); }    
      todayCodeUse[catcode]++;
    }
  }
  catch(e) { log("initSchedule: "+e.message); return ""; }
  return mediaList;
}

// ********* LOAD CATEGORIES **********
function initFiles1() {
  try {
    //log("initFiles"+qStep);
    var cats=app.ListFolder(scontBase); //.split(",");
    cats=cats.sort();
    log("initFiles: Checking "+cats.length+" categories.");
    for(var xa=0; xa<cats.length; xa++) {
      var cacheFile=schedBase+cats[xa]+".txt";
      //log("Checking "+cacheFile);
      var cache=app.ReadFile(cacheFile);
      if(cache == "") { continue; }
      log("Loaded "+cacheFile);
      cache=cache.split("\n");
      for(var xb=0; xb<cache.length; xb++) { cache[xb]=cache[xb].trim(); }
      cachedCategories[cats[xa]]=cache;
      cats.splice(xa, 1);
      xa--;
    }
    categoriesQ=cats; // Remaining categories to try to load...
  }
  catch(e) { log("initFiles1: "+e.message); }
  return (qStep=2);
}

// ********* LIST FILES IN NEXT CATEGORY **********
function initFiles2() {
  try {
    //log("initFiles"+qStep+",cqlen="+categoriesQ.length+",fqlen="+foldersQ.length+",nflen="+newFiles.length);
    // If there are categories left to process and no folders or files
    if(categoriesQ.length > 0 && foldersQ.length == 0 && newFiles.length == 0) {
      curCategory=categoriesQ.shift();
      cachedCategories[curCategory]=saveFiles2;
      log("LISTING "+curCategory);
      playing.SetText("LISTING "+curCategory);
      foldersQ.push(scontBase+curCategory); // Add this folder to be listed
      return (qStep=3);
    }  
  }
  catch(e) { log("initFiles2: "+e.message); }
  return (qStep=5);
}

// ********* LIST CATEGORY **********
function initFiles3() {
  try {
    //log("initFiles3: fqlen="+foldersQ.length+",nflen="+newFiles.length);
    if(foldersQ.length==0 && newFiles.length==0) { return (qStep=4); }  // Nothing to do
    if(newFiles.length > 0) {                               // Process next file (if any)
      var sub=newFolder+"/"+newFiles.shift();               // Remove file from head
      var subFolder=sub+"/.";
      if(app.FolderExists(subFolder)) { foldersQ.push(sub); } //log("FOLD "+sub); }
      else { allFilesInCategory.push(sub); } //log("FILE "+sub); }
      return                                                // Do more later    
    }
    if(foldersQ.length==0) { return; }                    // Do more later
    var folder=foldersQ.shift();                          // Remove folder from head
    //  log("initFiles3: foldersQ.length="+foldersQ.length+" LISTING "+folder);
    var files=app.ListFolder(folder);                       // List contents of folder
    if(files.length == 0) { return; }                      // Do more later
    newFolder=folder;
    newFiles=files; //.split(",");  
    //  log("initFiles3: Saving "+newFiles.length+" files/folders");
  }
  catch(e) { log("initFiles3: "+e.message); }
}

// ********* SAVE CATEGORY **********
function initFiles4() {
  try {
    //log("initFiles"+qStep);
    if(allFilesInCategory.length > 0) {
      allFilesInCategory=allFilesInCategory.sort();
      saveFiles=allFilesInCategory;
      //log("saveFiles="+saveFile);
      //log("initFiles"+qStep);
      allFilesInCategory=[];
      // Save the files to cache and memory
      saveCacheFile=schedBase+curCategory+".txt";
      log("Saving times to "+saveCacheFile);
      app.WriteFile(saveCacheFile,"");
      lenPlayer_OnComplete();
  //       for(var xa=0; xa<saveFiles.length; xa++) {
  //         app.WriteFile(saveCacheFile,saveFiles[xa]+"\r\n","Append");
  //       }
    }
  }
  catch(e) { log("initFiles4: "+e.message); }
  return (qStep=2); // Check next category
}

// ********* INITIALIZED FILES **********
function initFiles() {
  try {
    if(qStep == 1) { return initFiles1(); }
    if(qStep == 2) { return initFiles2(); }
    if(qStep == 3) { return initFiles3(); } // Use foldersQ to list next category
    if(qStep == 4) { return initFiles4(); } // Save category
    if(qStep == 5) {
      clearInterval(fInit);
      filesinit=true;
      log("FILES INITIALIZED");
      return (qStep=6);
    }
  }
  catch(e) { log("initFiles: "+e.message); }
  return qStep;
}

function PlayNextFile() {
  try {
    var items=playList.GetList('\n').split("\n");
    var item=""; // Below, get First item from playlist, removing up to 10 consecutive blank items as well.
    for(var xa=0; xa<10; xa++) {
      item=items.splice(0, 1);
      if(item.length>0) { item=item[0]; }
      else item="";
      if(item != "") { break; }
    }
    var mediaList=items.join("\n");
    if(mediaList == "") {
      mediaList=initSchedule();
      if(mediaList == "") { return ""; }
      mediaList+="\n**END OF SCHEDULE**\n";
    }
    mediaList=mediaList.replace(/:/g,'^c^'); // Replace colons
    playList.SetList(mediaList)// ,'\n'); // LF to split items in list
    if(item.substring(0,7) == "Loading") { return PlayNextFile(); }
    var playFile=item.substring(9);
    var at=item.substring(0,8);
    //var playFile=item; //var at="";
    log("At "+at+" PLAYING "+playFile+"***");
    player.SetFile(playFile);
    curFile=playFile;
  }
  catch(e) { log("PlayNextFile: "+e.message); }
  return item;
}

//********** CALLBACKS ************
//Update seek bar. 
function Update() {
  try {
    refreshCount++;
    if(lenPlayer_timeout>0) {
      lenPlayer_timeout--;
      if(lenPlayer_timeout == 0) { lenPlayer_OnComplete(); }
    }
    if(!filesinit) { playing.SetText("At "+refreshCount+" loaded "+allFilesInCategory.length+" files,catQlen="+categoriesQ.length+",fqlen="+foldersQ.length+",nflen="+newFiles.length+",sflen="+saveFiles.length); return; }
    if(!started) { PlayNextFile(); started=true; return; }
    if(player.IsPlaying()) {
        var prog = player.GetPosition();
      playing.SetChecked(true);
      playing.SetText("Playing "+curFile+" ("+prog+")");
        dur = player.GetDuration();
        if( dur ) skb.SetValue( prog / dur );
    }
    else {
      playing.SetChecked(false);
      playing.SetText("Not Playing");
    }
    debug=isSet("debug");
    //player.SetFile( "/sdcard/music/" + item ); //player.Play(); //player.Pause(); //player.Stop(); //player.SeekTo( dur * value );   
  }
  catch(e) { log("Update: "+e.message); }
}

//Called when playback has finished. 
function player_OnComplete() {
  try {
  //  if(!fileSet) { return; } // Don't handle first time   
    playing.SetText("Not Playing");
    playing.SetChecked(false);
    var next=PlayNextFile();
    if(debug) log("01Finished; IsReady="+player.IsReady()+"; IsPlaying="+player.IsPlaying()+"; nextFile="+next);  
  }
  catch(e) { log("player_OnComplete: "+e.message); }
}

//Called when file is ready to play. 
function player_OnReady() { 
  try {
    dur = player.GetDuration();
    if(debug) log("02Ready.  dur="+dur+"; IsPlaying="+player.IsPlaying());   
    if(debug) player.SeekTo(dur-10);
    else      player.SeekTo(seekSecs);
    seekSecs=0;
  }
  catch(e) { log("player_OnReady: "+e.message); }
} 

function player_SeekDone() {   
  try {
    if(debug) log("03SeekDone: Playing...");
    player.Play();
  }
  catch(e) { log("player_SeekDone: "+e.message); }
}

//Called when user touches volume bar. 
function skbVol_OnTouch( value ) {
  try {
    log("skbVol_OnTouch "+value); 
    player.SetVolume( value, value ); 
  }
  catch(e) { log("skbVol_OnTouch: "+e.message); }
}

function lenPlayer_OnComplete() {
  try {
    //log("lenPlayer: saveFiles="+saveFiles);
  // if(allFilesOfs >= allFilesInCategory.length) { return; }
    //var lenFile=allFilesInCategory[allFilesOfs++]; //scontBase+"3585-TESTIMONY/TDY05085-1~3ABN_TODAY~All_Things_Are_Possible~.ogg";
    if(lenPlayer_timeout == 0 && lenFile != null) {
      log("BAD: "+lenFile); app.DeleteFile(lenFile);
    }
    lenFile=saveFiles.shift();
    if(lenFile == null) { lenPlayer_timeout=-1; qStep=2; return initFiles(); } 
    lenPlayer.SetFile(lenFile);  
    //log("lenFile="+lenFile);
    lenPlayer_timeout=2;
  }
  catch(e) { log("lenPlayer_OnComplete: "+e.message); }
}

//Called when file is ready to play. 
function lenPlayer_OnReady() { 
  try {
    var len=lenPlayer.GetDuration();
    var line=padToFour(len)+" "+lenFile;
    //log("CACHE: "+line);
    app.WriteFile(saveCacheFile,line+"\r\n","Append");  
    saveFiles2.push(line); // lenFile
    lenPlayer_OnComplete();
  }
  catch(e) { log("lenPlayer_OnReady: "+e.message); }
} 
//********** UTILITIES ************
function getAllMethods(object) {
  try {
    return Object.getOwnPropertyNames(object).filter(function(property) {
        return typeof object[property] == 'function';
    });
  }
  catch(e) { log("getAllMethods: "+e.message); }
}

function padToFour(number) {
  try {
    number=Math.round(number);
    if (number<=9999) { number = ("000"+number).slice(-4); }
  }
  catch(e) { log("padToFour: "+e.message); }
  return number;
}

function dateToYMD(date) {
  try {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getFullYear();
  }
  catch(e) { log("dateToYMD: "+e.message); }
  return              '' + y  + '-' + 
    (m  <= 9 ? '0' +  m : m)  + '-' +
    (d  <= 9 ? '0' +  d : d);
}
function dateToHMS(date) {
  try {
    var hh = date.getHours();
    var mm = date.getMinutes();
    var ss = date.getSeconds();
  }
  catch(e) { log("dateToHMS: "+e.message); }
  return (hh <= 9 ? '0' + hh : hh) + ':' +
         (mm <= 9 ? '0' + mm : mm) + ':' +
         (ss <= 9 ? '0' + ss : ss);
}
function dateToYMDHMS(date) {
  return dateToYMD(date) + ' ' + dateToHMS(date);
}

function fwdlog(msg) {
  if(logTxt==null) { return; }
  var d = dateToYMDHMS(new Date());
  var o=logTxt.GetList('\n');
  if(o.length > 0) { o+="\n"; }
  var newText=(o+d+" "+msg).replace(/:/g,'^c^');
  logTxt.SetList(newText); //,"\n");
}

function log(msg) {
  if(logTxt==null) { return; }
  var d = dateToYMDHMS(new Date());
  var o=logTxt.GetList('\n');
  if(o.length > 0) {
    if(o.length < LOGLIMIT) { o="\n"+o; }
    else { o="\n"+o.substring(0,LOGLIMIT); }
  }
  var newText=(d+" "+msg+o).replace(/:/g,'^c^');
  logTxt.SetList(newText); //,"\n");
  app.WriteFile(logPath,d+" "+msg+"\r\n","Append");
}

Date.prototype.getWeekNumber = function(){
    var d = new Date(+this);
    d.setHours(0,0,0);
    d.setDate(d.getDate()+4-(d.getDay()||7));
    return Math.ceil((((d-new Date(d.getFullYear(),0,1))/8.64e7)+1)/7);
};

function randOrd(){ return (Math.round(Math.random())-0.5); }
// anyArray.sort( randOrd );

/********** VARIABLE UTILITIES ************/
function isSet(varName) {
  return app.FileExists(varBase+varName+"=true");
}

function set(varName,val) {
  try {
    var setVars=app.ListFolder(varBase,varName+"="); //.split(",");
    for(var xa=0; xa<setVars.length; xa++) {
      if(varBase+setVars[xa] == varBase) { continue; } // Ignore folder itself
      app.DeleteFile(varBase+setVars[xa]);
    }
    app.WriteFile(varBase+varName+"="+val);
  }
  catch(e) { log("set: "+e.message); }
}

function initVar(varName,dftVal) {
  try {
    var setVars=app.ListFolder(varBase,varName+"="); //.split(",");
    for(var xa=0; xa<setVars.length; xa++) {
      if(varBase+setVars[xa] == varBase) { continue; } // Ignore folder itself
      return; // Any other settings, keep
    }
    app.WriteFile(varBase+varName+"="+dftVal);
  }
  catch(e) { log("initVar: "+e.message); }
}

function get(varName,dft) {
  try {
    var setVars=app.ListFolder(varBase,varName+"="); //.split(",");
    for(var xa=0; xa<setVars.length; xa++) {
      if(setVars[xa].substring(0,varName.length+1) == varName+"=") { return setVars[xa].substring(varName.length+1); }
    }
  }
  catch(e) { log("get: "+e.message); }
  return dft!=null?dft:"";
}
function getInt(varName,dft) {
  var ret=get(varName,dft);
  return ret!=""?ret:0;
} 
