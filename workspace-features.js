const LIBRARY_DB="wireless-canvas-library",LIBRARY_ACTIVE="wireless-canvas-active-board";
const boardLibrary={db:null,currentId:null,title:"我的讲解画布",records:[],versions:[],tab:"boards",queue:Promise.resolve(),busy:false};
let desktopClosing=false;
function libraryRequest(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function libraryTransaction(stores,mode,operation){
  return new Promise((resolve,reject)=>{
    const transaction=boardLibrary.db.transaction(stores,mode);let result;
    transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error("Storage transaction aborted"));
    try{result=operation(transaction);}catch(error){transaction.abort();reject(error);}
  });
}
async function initializeBoardLibrary(legacy){
  try{
    boardLibrary.db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(LIBRARY_DB,2);
      request.onupgradeneeded=()=>{
        const database=request.result;
        if(!database.objectStoreNames.contains("boards"))database.createObjectStore("boards",{keyPath:"id"});
        if(!database.objectStoreNames.contains("versions"))database.createObjectStore("versions",{keyPath:"id"});
        const versions=request.transaction.objectStore("versions");if(!versions.indexNames.contains("boardId"))versions.createIndex("boardId","boardId");
      };
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error("Storage unavailable"));
    });
    boardLibrary.db.onversionchange=()=>{boardLibrary.db.close();boardLibrary.db=null;};
    boardLibrary.records=await libraryRequest(boardLibrary.db.transaction("boards").objectStore("boards").getAll());
    const activeId=localStorage.getItem(LIBRARY_ACTIVE);
    const active=boardLibrary.records.find(record=>record.id===activeId&&!record.archived)||boardLibrary.records.filter(record=>!record.archived).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(active){boardLibrary.currentId=active.id;boardLibrary.title=active.title;return active.data;}
  }catch(error){console.warn("Board library storage unavailable",error);boardLibrary.db=null;}
  if(!boardLibrary.db){
    try{
      boardLibrary.records=JSON.parse(localStorage.getItem("wireless-canvas-library-fallback")||"[]");
      const active=boardLibrary.records.find(record=>record.id===localStorage.getItem(LIBRARY_ACTIVE)&&!record.archived)||boardLibrary.records.filter(record=>!record.archived).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
      if(active){boardLibrary.currentId=active.id;boardLibrary.title=active.title;return active.data;}
    }catch{boardLibrary.records=[];}
  }
  boardLibrary.currentId=uid("board");boardLibrary.title=legacy?.title||"我的讲解画布";return legacy;
}
function currentBoardData(){return{version:4,title:boardLibrary.title,savedAt:new Date().toISOString(),theme:app.theme,edgeStyle:app.edgeStyle,nodes:app.nodes,edges:app.edges,frames:app.frames};}
function readBoardVersions(id){return libraryRequest(boardLibrary.db.transaction("versions").objectStore("versions").index("boardId").getAll(id));}
function boardPreview(data){
  const canvas=document.createElement("canvas");canvas.width=144;canvas.height=88;const context=canvas.getContext("2d");
  context.fillStyle=data.theme==="night"?"#222329":"#eff0f2";context.fillRect(0,0,144,88);
  if(!data.nodes.length)return canvas.toDataURL();
  const left=Math.min(...data.nodes.map(n=>n.x)),top=Math.min(...data.nodes.map(n=>n.y));
  const right=Math.max(...data.nodes.map(n=>n.x+n.w)),bottom=Math.max(...data.nodes.map(n=>n.y+n.h)),scale=Math.min(128/Math.max(1,right-left),72/Math.max(1,bottom-top));
  const x=n=>8+(n.x-left)*scale,y=n=>8+(n.y-top)*scale;
  context.strokeStyle="#9da3af";
  data.edges.forEach(edge=>{const a=data.nodes.find(n=>n.id===edge.from),b=data.nodes.find(n=>n.id===edge.to);if(!a||!b)return;context.beginPath();context.moveTo(x(a)+a.w*scale,y(a)+a.h*scale/2);context.lineTo(x(b),y(b)+b.h*scale/2);context.stroke();});
  const colors={mint:"#a9c8b8",blue:"#b1c8e0",yellow:"#dfcba2",rose:"#dab4b7",ink:"#b9bdc8"};
  data.nodes.forEach(node=>{context.fillStyle=colors[node.color]||colors.ink;context.fillRect(x(node),y(node),Math.max(2,node.w*scale),Math.max(2,node.h*scale));});
  return canvas.toDataURL();
}
function persistCurrentBoard(manual=false){
  const data=JSON.parse(JSON.stringify(currentBoardData())),id=boardLibrary.currentId;
  const operation=async()=>{
    const previous=boardLibrary.records.find(record=>record.id===id),now=Date.now();
    const changed=!previous||JSON.stringify({...previous.data,savedAt:null})!==JSON.stringify({...data,savedAt:null});
    const eligible=!previous||manual||now-(previous.checkpointAt||0)>=60000;
    const oldVersions=boardLibrary.db&&eligible?(await readBoardVersions(id)).sort((a,b)=>b.savedAt-a.savedAt):[];
    const checkpoint=eligible&&(!oldVersions.length||JSON.stringify({...oldVersions[0].data,savedAt:null})!==JSON.stringify({...data,savedAt:null}));
    const record={id,title:data.title,updatedAt:now,archived:false,checkpointAt:checkpoint?now:previous?.checkpointAt||0,data,thumbnail:changed?boardPreview(data):previous?.thumbnail};
    if(boardLibrary.db){
      await libraryTransaction(["boards","versions"],"readwrite",transaction=>{
        transaction.objectStore("boards").put(record);
        if(checkpoint){transaction.objectStore("versions").put({id:uid("version"),boardId:id,savedAt:now,data});oldVersions.slice(9).forEach(version=>transaction.objectStore("versions").delete(version.id));}
      });
    }else{
      const records=boardLibrary.records.filter(item=>item.id!==id);records.push(record);
      localStorage.setItem("wireless-canvas-library-fallback",JSON.stringify(records));
    }
    boardLibrary.records=boardLibrary.records.filter(item=>item.id!==id);boardLibrary.records.push(record);
    try{localStorage.setItem(LIBRARY_ACTIVE,id);localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch{}
    return record;
  };
  const pending=boardLibrary.queue.then(operation);boardLibrary.queue=pending.catch(()=>{});return pending;
}
async function saveBoardToLibrary(showMessage=false){
  try{await persistCurrentBoard(showMessage);if(!app.presentation)$("#saveStatus").textContent=`已保存 ${new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}`;if(showMessage)showToast("画布已保存到本地");return true;}
  catch(error){$("#saveStatus").textContent="保存失败";showToast("保存失败，请导出画布备份后重试");console.error("Board save failed",error);return false;}
}
function applyBoardData(state){
  finishNodeTitleEdit(false);clearMarquee();clearConnection();clearTimeout(saveTimer);clearTimeout(historyCommitTimer);closeSearch();
  app.nodes=state.nodes||[];app.edges=normalizeEdges(state.edges||[],state.edgeStyle);app.frames=(state.frames||[]).map(frame=>({...frame,kind:frame.kind||"chapter"}));app.edgeStyle=state.edgeStyle||"solid";
  app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;app.editingFrame=false;app.activeFrameId=chapterFrames()[0]?.id||null;
  app.drag=null;app.frameDrag=null;app.panDrag=null;clearNodeResize();setTheme(state.theme||app.theme,false);app.scale=1;setInitialView();resetHistory();render();if(app.nodes.length)fitBoard();
}
async function createLibraryBoard(){
  if(boardLibrary.busy||app.presentation)return;boardLibrary.busy=true;
  try{
    finishNodeTitleEdit();flushHistory();clearTimeout(saveTimer);if(!await saveBoardToLibrary(true))return;
    const oldId=boardLibrary.currentId,oldTitle=boardLibrary.title;
    boardLibrary.currentId=uid("board");boardLibrary.title=`未命名画布 ${boardLibrary.records.filter(record=>!record.archived).length+1}`;
    const empty={nodes:[],edges:[],frames:[],theme:app.theme,edgeStyle:app.edgeStyle};
    // Persist the empty board before leaving the existing one.
    const oldData=currentBoardData();
    app.nodes=[];app.edges=[];app.frames=[];
    if(!await saveBoardToLibrary()){boardLibrary.currentId=oldId;boardLibrary.title=oldTitle;applyBoardData(oldData);return;}
    applyBoardData(empty);if($("#libraryDialog").open){$("#boardNameField").value=boardLibrary.title;await renderLibrary();}showToast("已新建画布，原画布保留在画布库");
  }finally{boardLibrary.busy=false;}
}
function validateImportedBoard(input){
  if(!input||!Array.isArray(input.nodes)||!Array.isArray(input.edges)||input.nodes.length>10000)throw new Error("Invalid board");
  const finite=(value,fallback)=>Number.isFinite(value)?value:fallback,ids=new Set();
  const nodes=input.nodes.map(source=>{
    if(!source||typeof source.id!=="string"||!source.id||ids.has(source.id)||!Object.hasOwn(typeDefaults,source.type))throw new Error("Invalid node");ids.add(source.id);
    const defaults=typeDefaults[source.type],src=typeof source.src==="string"&&(source.src===SAMPLE_IMAGE||/^data:[^,]*,/i.test(source.src))?source.src:"";
    return{...makeNode(source.type),...source,id:source.id,title:String(source.title||"未命名"),body:String(source.body||""),fileName:String(source.fileName||""),src,color:["mint","blue","yellow","rose","ink"].includes(source.color)?source.color:defaults.color,x:finite(source.x,120),y:finite(source.y,120),w:Math.max(NODE_MIN_WIDTH,Math.min(20000,finite(source.w,defaults.w))),h:Math.max(NODE_MIN_HEIGHT,Math.min(20000,finite(source.h,defaults.h))),manualHeight:Number.isFinite(source.manualHeight)?Math.max(NODE_MIN_HEIGHT,source.manualHeight):null};
  });
  const edgeIds=new Set(),edges=normalizeEdges(input.edges.filter(edge=>edge&&ids.has(edge.from)&&ids.has(edge.to)).map(edge=>{const id=typeof edge.id==="string"&&!edgeIds.has(edge.id)?edge.id:uid("edge");edgeIds.add(id);return{...edge,id,label:String(edge.label||"").slice(0,120)};}),input.edgeStyle);
  const frameIds=new Set(),frames=(Array.isArray(input.frames)?input.frames:[]).filter(frame=>frame&&typeof frame==="object").map(frame=>{
    const id=typeof frame.id==="string"&&!frameIds.has(frame.id)?frame.id:uid("frame");frameIds.add(id);
    return{...frame,id,title:String(frame.title||"未命名"),notes:String(frame.notes||""),kind:frame.kind==="group"?"group":"chapter",collapsed:Boolean(frame.collapsed),reveal:Boolean(frame.reveal),x:finite(frame.x,0),y:finite(frame.y,0),w:Math.max(240,Math.min(20000,finite(frame.w,600))),h:Math.max(180,Math.min(20000,finite(frame.h,400))),nodeIds:(Array.isArray(frame.nodeIds)?frame.nodeIds:[]).filter(id=>ids.has(id)),revealOrder:(Array.isArray(frame.revealOrder)?frame.revealOrder:[]).filter(id=>ids.has(id))};
  });
  return{nodes,edges,frames,theme:input.theme==="night"?"night":"day",edgeStyle:input.edgeStyle==="dashed"?"dashed":"solid",title:String(input.title||"").slice(0,100)};
}
async function importLibraryBoard(file){
  if(!file||boardLibrary.busy||app.presentation)return;boardLibrary.busy=true;
  const oldId=boardLibrary.currentId,oldTitle=boardLibrary.title;let oldData;
  try{
    const state=validateImportedBoard(JSON.parse(await file.text()));finishNodeTitleEdit();clearTimeout(saveTimer);if(!await saveBoardToLibrary(true))return;
    oldData=structuredClone(currentBoardData());boardLibrary.currentId=uid("board");boardLibrary.title=state.title||file.name.replace(/\.json$/i,"")||"导入的画布";
    applyBoardData(state);
    if(!await saveBoardToLibrary(true)){boardLibrary.currentId=oldId;boardLibrary.title=oldTitle;applyBoardData(oldData);return;}
    showToast("已导入为新画布，原画布仍保留");
  }catch(error){if(oldData){boardLibrary.currentId=oldId;boardLibrary.title=oldTitle;applyBoardData(oldData);}showToast("导入失败：文件格式不正确");}
  finally{boardLibrary.busy=false;}
}
async function openBoardRecord(id){
  if(boardLibrary.busy||id===boardLibrary.currentId)return;const record=boardLibrary.records.find(item=>item.id===id);if(!record||record.archived)return;
  boardLibrary.busy=true;
  try{finishNodeTitleEdit();clearTimeout(saveTimer);if(!await saveBoardToLibrary(true))return;boardLibrary.currentId=id;boardLibrary.title=record.title;applyBoardData(structuredClone(record.data));await saveBoardToLibrary();$("#libraryDialog").close();showToast(`已打开 ${record.title}`);}finally{boardLibrary.busy=false;}
}
async function openLibrary(){
  if(app.presentation)return;finishNodeTitleEdit();clearTimeout(saveTimer);await saveBoardToLibrary();
  $("#boardNameField").value=boardLibrary.title;$("#libraryDialog").showModal();boardLibrary.tab="boards";await renderLibrary();
}
async function renderLibrary(){
  $("#libraryBoardsTab").setAttribute("aria-selected",String(boardLibrary.tab==="boards"));$("#libraryVersionsTab").setAttribute("aria-selected",String(boardLibrary.tab==="versions"));
  $("#libraryStatus").textContent=boardLibrary.db?(window.canvasDesktop?.isDesktop?"保存在此电脑的本地应用数据中":"保存在此浏览器的本地数据库"):"使用浏览器本地存储";
  const list=$("#libraryList");list.replaceChildren();
  if(boardLibrary.tab==="versions"){
    const id=boardLibrary.currentId;
    const versions=boardLibrary.db?(await readBoardVersions(id)).sort((a,b)=>b.savedAt-a.savedAt):[];
    if(boardLibrary.tab!=="versions"||id!==boardLibrary.currentId)return;
    boardLibrary.versions=versions;
    list.innerHTML=versions.length?versions.map(version=>`<div class="library-row"><div class="library-row-text"><strong>${escapeHtml(new Date(version.savedAt).toLocaleString("zh-CN"))}</strong><small>${version.data.nodes.length} 个节点 · ${version.data.edges.length} 条连接</small></div><button class="icon-button" data-restore-version="${escapeAttr(version.id)}" title="恢复此版本" aria-label="恢复此版本">${icon("History")}</button></div>`).join(""):'<div class="dialog-empty">暂无历史版本</div>';
    list.querySelectorAll("[data-restore-version]").forEach(button=>button.addEventListener("click",()=>restoreBoardVersion(button.dataset.restoreVersion)));
    return;
  }
  list.innerHTML=boardLibrary.records.sort((a,b)=>Number(a.archived)-Number(b.archived)||b.updatedAt-a.updatedAt).map(record=>`<div class="library-row ${record.archived?"archived":""}"><img class="board-thumbnail" src="${record.thumbnail||""}" alt="" /><button class="library-open" data-open-board="${escapeAttr(record.id)}" ${record.archived?"disabled":""}><strong>${escapeHtml(record.title)}${record.id===boardLibrary.currentId?' <span class="current-board-tag">当前</span>':""}</strong><small>${record.archived?"已归档 · ":""}${record.data.nodes.length} 个节点 · ${escapeHtml(new Date(record.updatedAt).toLocaleString("zh-CN"))}</small></button><button class="icon-button" data-archive-board="${escapeAttr(record.id)}" ${record.id===boardLibrary.currentId?"disabled":""} title="${record.archived?"恢复画布":"归档画布"}" aria-label="${record.archived?"恢复画布":"归档画布"}">${icon(record.archived?"ArchiveRestore":"Archive")}</button></div>`).join("");
  list.querySelectorAll("[data-open-board]").forEach(button=>button.addEventListener("click",()=>openBoardRecord(button.dataset.openBoard)));
  list.querySelectorAll("[data-archive-board]").forEach(button=>button.addEventListener("click",()=>archiveBoard(button.dataset.archiveBoard)));
}
async function archiveBoard(id){
  if(id===boardLibrary.currentId||boardLibrary.busy)return;const record=boardLibrary.records.find(item=>item.id===id);if(!record)return;
  boardLibrary.busy=true;
  const updated={...record,archived:!record.archived};
  try{await boardLibrary.queue;if(boardLibrary.db)await libraryTransaction(["boards"],"readwrite",transaction=>transaction.objectStore("boards").put(updated));else localStorage.setItem("wireless-canvas-library-fallback",JSON.stringify(boardLibrary.records.map(item=>item.id===id?updated:item)));Object.assign(record,updated);await renderLibrary();}catch{showToast("画布归档失败，请重试");}finally{boardLibrary.busy=false;}
}
async function restoreBoardVersion(id){
  if(boardLibrary.busy)return;const version=boardLibrary.versions.find(item=>item.id===id);if(!version)return;boardLibrary.busy=true;
  try{finishNodeTitleEdit();if(!await saveBoardToLibrary(true))return;flushHistory();const data=structuredClone(version.data);app.nodes=data.nodes;app.edges=normalizeEdges(data.edges,data.edgeStyle);app.frames=data.frames||[];app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;app.editingFrame=false;app.activeFrameId=null;app.edgeStyle=data.edgeStyle||"solid";setTheme(data.theme,false);commitChange();render();fitBoard();await saveBoardToLibrary(true);$("#libraryDialog").close();showToast("已恢复历史版本，可撤销恢复");}finally{boardLibrary.busy=false;}
}
function collapsedGroupForNode(id){return app.presentation?null:app.frames.find(frame=>isGroup(frame)&&frame.collapsed&&(frame.nodeIds||[]).includes(id));}
function frameDisplayBox(frame){return isGroup(frame)&&frame.collapsed&&!app.presentation?{x:frame.x,y:frame.y,w:260,h:82}:frame;}
function toggleGroupCollapse(id){
  const frame=getFrame(id);if(!isGroup(frame)||app.presentation)return;finishNodeTitleEdit();flushHistory();clearConnection();frame.collapsed=!frame.collapsed;
  app.activeFrameId=id;app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;app.editingFrame=true;render();commitChange();
}
function selectEdge(id,edit=false){
  if(app.presentation)return;finishNodeTitleEdit();app.selectedEdgeId=id;app.selectedId=null;app.selectedIds=[];app.editingFrame=false;
  document.querySelectorAll(".node.selected").forEach(el=>el.classList.remove("selected"));renderInspector();
  if(edit){$("#edgeLabelField").focus();$("#edgeLabelField").select();document.body.classList.add("inspector-open");}
}
function selectedEdge(){return app.edges.find(edge=>edge.id===app.selectedEdgeId);}
function removeSelectedEdge(){if(app.presentation||!selectedEdge())return;flushHistory();app.edges=app.edges.filter(edge=>edge.id!==app.selectedEdgeId);app.selectedEdgeId=null;commitChange();renderConnections();renderInspector();renderMeta();showToast("连接已删除");}
function edgeEndpoint(id,output){
  const group=collapsedGroupForNode(id),node=getNode(id);if(!node)return null;
  const box=group?frameDisplayBox(group):{...node,h:nodeHeight(node)};
  return{x:output?box.x+box.w+4:box.x-4,y:box.y+box.h/2,groupId:group?.id};
}
function renderEnhancedConnections(){
  const group=$("#connections");
  group.innerHTML=app.edges.map(edge=>{
    const a=edgeEndpoint(edge.from,true),b=edgeEndpoint(edge.to,false);if(!a||!b||a.groupId&&a.groupId===b.groupId)return"";
    if(app.presentation&&(!presentationNodeVisible(edge.from)||!presentationNodeVisible(edge.to)))return"";
    return`<g class="connection-item ${edge.id===app.selectedEdgeId?"selected":""}" data-connection-id="${escapeAttr(edge.id)}"><path class="connection-path${edge.style==="dashed"?" dashed":""}" data-edge-id="${escapeAttr(edge.id)}" d="${connectionCurve(a.x,a.y,b.x,b.y)}"></path><path class="connection-hit" d="${connectionCurve(a.x,a.y,b.x,b.y)}" tabindex="${app.presentation?-1:0}" role="button" aria-label="${escapeAttr(edge.label||"选择连接")}"></path>${edge.label?`<text class="connection-label" text-anchor="middle" dy="-9">${escapeHtml(edge.label)}</text>`:""}</g>`;
  }).join("");
  group.querySelectorAll(".connection-item").forEach(item=>{
    const path=item.querySelector(".connection-path"),label=item.querySelector(".connection-label");
    if(label){const point=path.getPointAtLength(path.getTotalLength()/2);label.setAttribute("x",point.x);label.setAttribute("y",point.y);}
    item.addEventListener("pointerdown",event=>{if(app.presentation)return;event.stopPropagation();selectEdge(item.dataset.connectionId);});
    item.addEventListener("dblclick",event=>{event.stopPropagation();selectEdge(item.dataset.connectionId,true);});
    item.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();selectEdge(item.dataset.connectionId,true);}});
  });
}
function renderFeatureInspector(frame){
  const edge=selectedEdge();$("#edgeForm").hidden=!edge;
  document.querySelectorAll(".connection-item").forEach(item=>item.classList.toggle("selected",item.dataset.connectionId===app.selectedEdgeId));
  if(edge){$("#inspectorEmpty").hidden=true;$("#inspectorForm").hidden=true;$("#chapterForm").hidden=true;$("#deleteSelectedButton").hidden=false;$("#deleteSelectedButton").disabled=false;$("#deleteSelectedButton").title="删除当前连接";$("#inspectorTitle").textContent="连接属性";$("#edgeLabelField").value=edge.label||"";$("#edgeFacts").textContent=`${getNode(edge.from)?.title||""} → ${getNode(edge.to)?.title||""}`;document.querySelectorAll("[data-selected-edge-style]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.selectedEdgeStyle===edge.style)));}
  else $("#deleteSelectedButton").title="删除当前节点";
  $("#collapseGroupButton").hidden=!isGroup(frame);$("#revealSettings").hidden=!frame||isGroup(frame);
  if(isGroup(frame))$("#collapseGroupButton").innerHTML=`${icon(frame.collapsed?"UnfoldVertical":"FoldVertical")}<span>${frame.collapsed?"展开编组":"折叠编组"}</span>`;
  if(frame&&!isGroup(frame)){
    $("#revealEnabledField").checked=Boolean(frame.reveal);const ids=orderedFrameNodes(frame);
    $("#revealOrderList").hidden=!frame.reveal;$("#revealOrderList").innerHTML=ids.map((id,index)=>`<li><span>${index+1}. ${escapeHtml(getNode(id).title)}</span><button class="icon-button" data-order-node="${escapeAttr(id)}" data-direction="-1" ${index===0?"disabled":""} title="前移" aria-label="前移">${icon("ArrowUp")}</button><button class="icon-button" data-order-node="${escapeAttr(id)}" data-direction="1" ${index===ids.length-1?"disabled":""} title="后移" aria-label="后移">${icon("ArrowDown")}</button></li>`).join("");
  }
}
function orderedFrameNodes(frame){
  if(!frame)return[];const members=app.nodes.filter(node=>isNodeInFrame(node,frame)),ids=members.map(node=>node.id);
  return [...new Set([...(frame.revealOrder||frame.nodeIds||[]),...ids])].filter(id=>ids.includes(id));
}
function presentationNodeVisible(id){
  const frame=getFrame(app.activeFrameId);if(!frame||!isNodeInFrame(getNode(id),frame))return false;
  return !frame.reveal||orderedFrameNodes(frame).slice(0,app.revealCount||1).includes(id);
}
function moveRevealOrder(id,direction){
  const frame=getFrame(app.activeFrameId);if(!frame||app.presentation)return;
  const ids=orderedFrameNodes(frame),index=ids.indexOf(id),next=index+direction;if(index<0||next<0||next>=ids.length)return;
  flushHistory();[ids[index],ids[next]]=[ids[next],ids[index]];frame.revealOrder=ids;commitChange();renderFeatureInspector(frame);
}
function closeSearch(){const panel=$("#searchPanel");if(!panel)return;panel.hidden=true;$("#searchButton").setAttribute("aria-expanded","false");}
function openSearch(){if(app.presentation)return;$("#searchPanel").hidden=false;$("#searchButton").setAttribute("aria-expanded","true");renderSearchResults();$("#searchField").focus();$("#searchField").select();}
function renderSearchResults(){
  const query=$("#searchField").value.trim().toLocaleLowerCase(),list=$("#searchResults");
  const matches=query?[...app.nodes.map(node=>({id:node.id,kind:"node",title:node.title,body:`${node.body||""}\n${node.fileName||""}`.trim(),type:typeLabel(node.type)})),...app.frames.map(frame=>({id:frame.id,kind:"frame",title:frame.title,body:frame.notes||"",type:isGroup(frame)?"编组":"章节"}))].filter(item=>`${item.title}\n${item.body}`.toLocaleLowerCase().includes(query)):[];
  app.searchMatches=matches.slice(0,60);app.searchIndex=0;
  list.innerHTML=app.searchMatches.map((item,index)=>{const position=item.body.toLocaleLowerCase().indexOf(query),snippet=item.body.slice(Math.max(0,position-14),Math.max(0,position-14)+90);return`<button class="search-result ${index===0?"active":""}" data-search-index="${index}" role="listitem"><span><strong>${escapeHtml(item.title||"未命名")}</strong><small>${escapeHtml(snippet)}</small></span><em>${item.type}</em></button>`;}).join("");
  $("#searchCount").textContent=query?matches.length?`${matches.length} 个结果${matches.length>60?"，显示前 60 项":""}`:"没有匹配的内容":"";
}
function locateSearchResult(index){
  const item=app.searchMatches?.[index];if(!item)return;
  if(item.kind==="node"){
    const node=getNode(item.id);if(!node)return;const groups=app.frames.filter(frame=>isGroup(frame)&&frame.collapsed&&(frame.nodeIds||[]).includes(node.id));
    if(groups.length){flushHistory();groups.forEach(frame=>frame.collapsed=false);commitChange();}
    render();selectNode(node.id);focusCanvasBox({x:node.x,y:node.y,w:node.w,h:nodeHeight(node)});nodeElement(node.id)?.classList.add("search-highlight");
  }else{
    const frame=getFrame(item.id);if(!frame)return;app.activeFrameId=frame.id;app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;app.editingFrame=true;render();focusCanvasBox(frameDisplayBox(frame));document.querySelector(`.canvas-frame[data-frame-id="${CSS.escape(frame.id)}"]`)?.classList.add("search-highlight");
  }
  closeSearch();document.body.classList.remove("sidebar-open");setTimeout(()=>document.querySelectorAll(".search-highlight").forEach(el=>el.classList.remove("search-highlight")),2200);
}
function focusCanvasBox(box){const viewport=$("#canvasViewport");app.scale=Math.min(1.15,(viewport.clientWidth-48)/(box.w+80),(viewport.clientHeight-70)/(box.h+80));app.scale=Math.max(.01,app.scale);app.pan={x:viewport.clientWidth/2-(box.x+box.w/2)*app.scale,y:viewport.clientHeight/2-(box.y+box.h/2)*app.scale};updateCamera();}
function documentMarkup(node){
  return`<div class="node-body document-body"><div class="document-badge">${icon("FileText")}</div><strong>${escapeHtml(node.fileName||"暂无文档")}</strong><span>${node.src?escapeHtml((node.fileName.split(".").pop()||"文档").toUpperCase()):node.fileName?"请重新附加原文件":"PDF / Word / TXT"}</span><div class="document-actions">${node.src?`<button class="icon-button" data-document-preview title="预览文档" aria-label="预览文档">${icon("Eye")}</button><button class="icon-button" data-document-download title="下载原文件" aria-label="下载原文件">${icon("Download")}</button>`:`<button class="icon-button" data-document-attach title="附加文档" aria-label="附加文档">${icon("Paperclip")}</button>`}</div></div>`;
}
function documentBlob(node){
  if(!node?.src?.startsWith("data:"))throw new Error("No document attached");const comma=node.src.indexOf(","),header=node.src.slice(0,comma),binary=header.includes(";base64")?atob(node.src.slice(comma+1)):decodeURIComponent(node.src.slice(comma+1));
  return new Blob([Uint8Array.from(binary,character=>character.charCodeAt(0))],{type:node.mimeType||header.slice(5).split(";")[0]||"application/octet-stream"});
}
function downloadDocument(id){
  const node=getNode(id);try{const url=URL.createObjectURL(documentBlob(node)),link=document.createElement("a");link.href=url;link.download=node.fileName||node.title;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{showToast("此节点未保存原文件，请重新附加文档");}
}
let documentPreviewURL=null,documentPreviewNode=null;
async function previewDocument(id){
  const node=getNode(id);if(!node)return;
  try{
    const blob=documentBlob(node),dialog=$("#documentDialog"),preview=$("#documentPreview");documentPreviewNode=id;preview.replaceChildren();$("#documentDialogTitle").textContent=node.fileName||node.title;
    if(node.fileName?.toLowerCase().endsWith(".pdf")||blob.type==="application/pdf"){
      const frame=document.createElement("iframe");documentPreviewURL=URL.createObjectURL(new Blob([blob],{type:"application/pdf"}));frame.src=documentPreviewURL;frame.title=node.fileName;preview.append(frame);
    }else if(/\.(txt|md|csv|json)$/i.test(node.fileName||"")){
      const text=document.createElement("pre");text.textContent=await blob.text();if(documentPreviewNode!==id)return;preview.append(text);
    }else{const empty=document.createElement("div");empty.className="document-unavailable";empty.innerHTML=`${icon("FileText")}<p>此格式请下载后使用本地应用打开</p>`;preview.append(empty);}
    if(!dialog.open)dialog.showModal();
  }catch{showToast("文档读取失败，请重新附加原文件");}
}
function bindWorkspaceFeatures(){
  $("#libraryButton").addEventListener("click",openLibrary);$("#libraryNewButton").addEventListener("click",createLibraryBoard);
  $("#boardNameField").addEventListener("change",async event=>{boardLibrary.title=event.target.value.trim()||"未命名画布";event.target.value=boardLibrary.title;$("#boardTitle").textContent=boardLibrary.title;await saveBoardToLibrary(true);await renderLibrary();});
  $("#libraryBoardsTab").addEventListener("click",()=>{boardLibrary.tab="boards";renderLibrary();});$("#libraryVersionsTab").addEventListener("click",()=>{boardLibrary.tab="versions";renderLibrary();});
  document.querySelectorAll("[data-close-dialog]").forEach(button=>button.addEventListener("click",()=>document.getElementById(button.dataset.closeDialog).close()));
  $("#documentDialog").addEventListener("close",()=>{documentPreviewNode=null;$("#documentPreview").replaceChildren();if(documentPreviewURL)URL.revokeObjectURL(documentPreviewURL);documentPreviewURL=null;});
  $("#downloadDocumentButton").addEventListener("click",()=>downloadDocument(documentPreviewNode));
  $("#searchButton").addEventListener("click",()=>$("#searchPanel").hidden?openSearch():closeSearch());$("#closeSearchButton").addEventListener("click",closeSearch);$("#searchField").addEventListener("input",renderSearchResults);
  $("#searchResults").addEventListener("click",event=>{const button=event.target.closest("[data-search-index]");if(button)locateSearchResult(Number(button.dataset.searchIndex));});
  $("#searchField").addEventListener("keydown",event=>{
    if(event.isComposing)return;const length=app.searchMatches?.length||0;
    if(event.key==="Enter"&&length){event.preventDefault();locateSearchResult(app.searchIndex);}
    if(["ArrowDown","ArrowUp"].includes(event.key)&&length){event.preventDefault();app.searchIndex=(app.searchIndex+(event.key==="ArrowDown"?1:-1)+length)%length;$("#searchResults").querySelectorAll("button").forEach((button,index)=>{button.classList.toggle("active",index===app.searchIndex);if(index===app.searchIndex)button.scrollIntoView({block:"nearest"});});}
  });
  $("#edgeLabelField").addEventListener("input",event=>{const edge=selectedEdge();if(!edge)return;edge.label=event.target.value;renderConnections();scheduleSave();});
  document.querySelectorAll("[data-selected-edge-style]").forEach(button=>button.addEventListener("click",()=>{const edge=selectedEdge();if(!edge)return;flushHistory();edge.style=button.dataset.selectedEdgeStyle;commitChange();renderConnections();renderInspector();}));
  $("#collapseGroupButton").addEventListener("click",()=>toggleGroupCollapse(app.activeFrameId));
  $("#revealEnabledField").addEventListener("change",event=>{const frame=getFrame(app.activeFrameId);if(!frame)return;flushHistory();frame.reveal=event.target.checked;frame.revealOrder=orderedFrameNodes(frame);commitChange();renderInspector();});
  $("#revealOrderList").addEventListener("click",event=>{const button=event.target.closest("[data-order-node]");if(button)moveRevealOrder(button.dataset.orderNode,Number(button.dataset.direction));});
  window.addEventListener("pagehide",()=>{if(!boardLibrary.busy&&!desktopClosing)saveBoardToLibrary();});
}
if(window.canvasDesktop?.isDesktop)window.canvasDesktop.onCloseCancelled?.(()=>{desktopClosing=false;document.body.inert=false;});
if(window.canvasDesktop?.isDesktop)window.canvasDesktop.onBeforeClose(async()=>{
  if(desktopClosing)return;desktopClosing=true;document.body.inert=true;
  let saved=false;
  try{
    while(!document.documentElement.dataset.ready||boardLibrary.busy||app.pendingReads)await new Promise(resolve=>setTimeout(resolve,25));
    finishNodeTitleEdit();flushHistory();clearTimeout(saveTimer);clearTimeout(historyCommitTimer);
    saved=await saveBoard(false);
  }catch(error){console.error("Desktop close save failed",error);}
  if(!saved){desktopClosing=false;document.body.inert=false;}
  window.canvasDesktop.completeClose(saved);
});
