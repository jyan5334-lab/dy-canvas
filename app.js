const STORAGE_KEY="wireless-canvas-local-v1";const SAMPLE_IMAGE="./media/sample-observation.png";const $=s=>document.querySelector(s);const uid=p=>`${p}-${Math.random().toString(36).slice(2,8)}-${Date.now().toString(36).slice(-4)}`;
function icon(name){return lucide.createElement(lucide.icons[name],{class:"icon","aria-hidden":"true",focusable:"false"}).outerHTML;}
function syncAppearanceControls(){
  document.querySelectorAll("[data-color]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.color===$("#colorField").value)));
  document.querySelectorAll("[data-edge-style]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.edgeStyle===app.edgeStyle)));
}
const app={nodes:[],edges:[],frames:[],selectedId:null,selectedIds:[],activeFrameId:null,presentation:false,presentationIndex:0,history:[],historyIndex:-1,historyLock:false,mode:"select",theme:"day",edgeStyle:"solid",scale:1,pan:{x:0,y:0},drag:null,titleEdit:null,nodeResize:null,marquee:null,panDrag:null,connectDraft:null,pendingCreation:null,pendingUploadId:null,toastTimer:null,space:false};
function closeFileMenu(){$(".topbar").classList.remove("file-menu-open");$("#mobileFileToggle").setAttribute("aria-expanded","false");}
const typeDefaults={text:{title:"新的讲解",body:"写下要讲解的观点，或者把一段说明拆成易懂的步骤。",color:"mint",w:230,h:150},image:{title:"本地图片",body:"",color:"blue",w:250,h:220},video:{title:"本地视频",body:"",color:"yellow",w:250,h:220},document:{title:"其他文档",body:"",color:"ink",w:250,h:170},other:{title:"其他内容",body:"把需要讲解的补充内容放在这里。",color:"rose",w:230,h:150}};
const NODE_MIN_WIDTH=140,NODE_MIN_HEIGHT=100;
const resizeCursors={nw:"nwse-resize",n:"ns-resize",ne:"nesw-resize",e:"ew-resize",se:"nwse-resize",s:"ns-resize",sw:"nesw-resize",w:"ew-resize"};
const makeNode=(type,overrides={})=>({id:uid("node"),type,x:120,y:120,...typeDefaults[type],src:"",fileName:"",resized:false,manualHeight:null,...overrides});
function normalizeEdges(edges,defaultStyle="solid"){
  // Older boards stored one shared style; preserve that appearance on each edge.
  return edges.map(edge=>({...edge,style:["solid","dashed"].includes(edge.style)?edge.style:defaultStyle==="dashed"?"dashed":"solid"}));
}
function starterState(){const nodes=[makeNode("text",{id:"problem",x:160,y:120,title:"问题是什么？",body:"先把复杂事情拆成可观察的线索。\n讲解时保持一个中心问题。",color:"mint"}),makeNode("image",{id:"observation",x:475,y:108,title:"现场观察",src:SAMPLE_IMAGE,fileName:"sample-observation.png",color:"blue"}),makeNode("text",{id:"clue",x:300,y:365,title:"线索串联",body:"一张图、一段话、一个动作，都可以成为下一步推理的入口。",color:"rose"}),makeNode("video",{id:"explain",x:660,y:370,title:"讲解片段",body:"拖入视频，配合节点讲清楚过程。",color:"yellow"})];return{nodes,edges:[{id:"edge-1",from:"problem",to:"observation"},{id:"edge-2",from:"observation",to:"clue"},{id:"edge-3",from:"explain",to:"clue"}]};}
function isGroup(frame){return frame?.kind==="group"}function isChapter(frame){return !isGroup(frame)}function chapterFrames(){return app.frames.filter(isChapter)}
async function init(){document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));const saved=await initializeBoardLibrary(loadSaved());const state=saved||starterState();app.nodes=state.nodes||[];app.edges=normalizeEdges(state.edges||[],state.edgeStyle);app.frames=(state.frames||[]).map(frame=>({...frame,kind:frame.kind||"chapter"}));app.theme=state.theme||readTheme();app.edgeStyle=state.edgeStyle||"solid";if(!app.frames.length&&app.nodes.length&&(!saved||Number(saved.version||1)<3))app.frames=[makeFrame("第一章：主要内容",app.nodes,"chapter")];app.activeFrameId=chapterFrames()[0]?.id||app.frames[0]?.id||null;setTheme(app.theme,false);setInitialView();bindEvents();bindWorkspaceFeatures();resetHistory();render();if(app.frames.length)fitFrame(getFrame(app.activeFrameId));else if(app.nodes.length)fitBoard();await saveBoard(false);document.documentElement.dataset.ready="true";showToast(saved?"已恢复本地草稿":"已载入演示画布");}
function readTheme(){try{return localStorage.getItem("wireless-canvas-theme")||"day"}catch{return"day"}}
function loadSaved(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):null}catch{return null}}
function setInitialView(){const viewport=$("#canvasViewport");app.pan={x:Math.max(20,(viewport.clientWidth-940)/2),y:Math.max(22,(viewport.clientHeight-620)/2)};}
function bindEvents(){
  document.addEventListener("pointerdown",event=>{if(app.titleEdit&&!event.target.closest(".node-title-editor"))finishNodeTitleEdit();},true);
  $("#themeToggle").addEventListener("click",()=>setTheme(app.theme==="day"?"night":"day"));
  $("#sidebarToggle").addEventListener("click",()=>{document.body.classList.toggle("sidebar-open");document.body.classList.remove("inspector-open");});
  $("#inspectorToggle").addEventListener("click",()=>{document.body.classList.toggle("inspector-open");document.body.classList.remove("sidebar-open");});
  $("#undoButton").addEventListener("click",undo);$("#redoButton").addEventListener("click",redo);$("#presentButton").addEventListener("click",togglePresentation);$("#exitPresentationButton").addEventListener("click",exitPresentation);$("#previousFrameButton").addEventListener("click",()=>stepFrame(-1));$("#nextFrameButton").addEventListener("click",()=>stepFrame(1));$("#addFrameButton").addEventListener("click",addFrameFromCurrent);$("#addGroupButton").addEventListener("click",groupSelectedNodes);
  $("#edgeStyleField").addEventListener("change",event=>{if(app.edgeStyle===event.target.value)return;flushHistory();app.edgeStyle=event.target.value;syncAppearanceControls();commitChange();showToast(app.edgeStyle==="solid"?"新连接将使用实线":"新连接将使用虚线")});
  document.querySelectorAll("[data-color]").forEach(button=>button.addEventListener("click",()=>{$("#colorField").value=button.dataset.color;$("#colorField").dispatchEvent(new Event("change"));syncAppearanceControls();}));
  document.querySelectorAll("[data-edge-style]").forEach(button=>button.addEventListener("click",()=>{$("#edgeStyleField").value=button.dataset.edgeStyle;$("#edgeStyleField").dispatchEvent(new Event("change"));}));
  $("#colorField").addEventListener("change",syncAppearanceControls);
  $(".file-button").addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();$("#importInput").click();}});
  $("#mobileFileToggle").addEventListener("click",()=>{const open=$(".topbar").classList.toggle("file-menu-open");$("#mobileFileToggle").setAttribute("aria-expanded",String(open));});
  $(".file-actions").addEventListener("click",closeFileMenu);
  document.addEventListener("pointerdown",event=>{if(!event.target.closest(".file-actions,#mobileFileToggle"))closeFileMenu();});
  $("#exportButton").addEventListener("click",toggleExportMenu);
  $("#exportJsonButton").addEventListener("click",()=>{closeExportMenu();exportBoard();});
  $("#exportPngButton").addEventListener("click",()=>{closeExportMenu();exportBoardImage();});
  $("#exportMenu").addEventListener("keydown",handleExportMenuKeydown);
  $("#exportMenu").addEventListener("focusout",event=>{if(!event.currentTarget.contains(event.relatedTarget)&&event.relatedTarget!==$("#exportButton"))closeExportMenu();});
  document.addEventListener("pointerdown",event=>{if(!event.target.closest("#exportMenu,#exportButton"))closeExportMenu();});
  window.addEventListener("resize",()=>closeExportMenu());
  $("#addTextButton").addEventListener("click",()=>addNode("text"));
  $("#addImageButton").addEventListener("click",()=>{app.pendingUploadId=null;$("#imageInput").click()});
  $("#addVideoButton").addEventListener("click",()=>{app.pendingUploadId=null;$("#videoInput").click()});
  $("#addDocumentButton").addEventListener("click",()=>{app.pendingUploadId=null;$("#documentInput").click()});
  $("#imageInput").addEventListener("change",e=>readMediaFile(e.target.files[0],"image",app.pendingUploadId));
  $("#videoInput").addEventListener("change",e=>readMediaFile(e.target.files[0],"video",app.pendingUploadId));
  $("#documentInput").addEventListener("change",e=>readMediaFile(e.target.files[0],"document",app.pendingUploadId));
  $("#newBoardButton").addEventListener("click",createLibraryBoard);$("#saveButton").addEventListener("click",()=>saveBoard(true));$("#importInput").addEventListener("change",importBoard);$("#fitButton").addEventListener("click",fitBoard);$("#zoomInButton").addEventListener("click",()=>setZoom(app.scale+.1));$("#zoomOutButton").addEventListener("click",()=>setZoom(app.scale-.1));$("#clearSelectionButton").addEventListener("click",()=>{app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;app.editingFrame=false;render()});$("#deleteSelectedButton").addEventListener("click",()=>selectedEdge()?removeSelectedEdge():deleteSelected());$("#titleField").addEventListener("input",updateSelectedFromInspector);$("#bodyField").addEventListener("input",updateSelectedFromInspector);$("#colorField").addEventListener("change",updateSelectedFromInspector);
  document.querySelectorAll("[data-create-type]").forEach(b=>b.addEventListener("click",()=>chooseCreationType(b.dataset.createType)));
  $("#closeCreationMenu").addEventListener("click",closeCreationMenu);document.addEventListener("keydown",handleKeydown);document.addEventListener("paste",handlePaste);document.addEventListener("pointerdown",event=>{if(!event.target.closest(".creation-menu"))closeCreationMenu()});
  const v=$("#canvasViewport");v.addEventListener("dblclick",handleCanvasDoubleClick);v.addEventListener("wheel",handleWheel,{passive:false});v.addEventListener("pointerdown",handleViewportPointerDown);window.addEventListener("pointermove",handlePointerMove);window.addEventListener("pointerup",handlePointerUp);window.addEventListener("pointercancel",handlePointerUp);v.addEventListener("dragover",e=>{e.preventDefault();$("#dropHint").textContent="松开以添加媒体"});v.addEventListener("dragleave",()=>$("#dropHint").textContent="拖入图片或视频到画布");v.addEventListener("drop",handleDrop);
  const selection=document.createElement("div");selection.id="selectionMarquee";selection.className="selection-marquee";selection.hidden=true;selection.setAttribute("aria-hidden","true");v.append(selection);
  v.append($("#canvasEmptyHint"));
  v.addEventListener("lostpointercapture",event=>{if(app.marquee?.pointerId===event.pointerId)clearMarquee(true);if(app.connectDraft?.pointerId===event.pointerId)clearConnection();});
  window.addEventListener("blur",()=>{clearMarquee(true);if(app.nodeResize)commitChange();clearNodeResize();app.space=false;clearConnection();app.panDrag=null;app.drag=null;app.frameDrag=null;});
  window.addEventListener("resize",()=>{clearMarquee(true);clearConnection();if(app.presentation)fitFrame(getFrame(app.activeFrameId));});
  document.addEventListener("fullscreenchange",()=>{if(app.presentation&&app.ownsFullscreen&&!document.fullscreenElement)exitPresentation();});
  ["#frameTitleField","#frameNotesField","#frameWidthField","#frameHeightField"].forEach(selector=>$(selector).addEventListener("input",updateFrameFromInspector));
  $("#frameUpButton").addEventListener("click",()=>reorderFrame(-1));$("#frameDownButton").addEventListener("click",()=>reorderFrame(1));$("#deleteFrameButton").addEventListener("click",deleteFrame);
  document.addEventListener("focusout",event=>{if(event.target.matches("textarea,input"))flushHistory();});
}
function setTheme(theme,showMessage=true){if(showMessage)flushHistory();app.theme=theme==="night"?"night":"day";document.documentElement.dataset.theme=app.theme;const button=$("#themeToggle");button.innerHTML=icon(app.theme==="day"?"Moon":"Sun");button.title=app.theme==="day"?"切换到夜晚模式":"切换到白天模式";button.setAttribute("aria-label",button.title);$("meta[name=theme-color]").content=app.theme==="night"?"#202126":"#fcfcfd";try{localStorage.setItem("wireless-canvas-theme",app.theme)}catch{}if(showMessage){commitChange();showToast(app.theme==="day"?"已切换到白天模式":"已切换到夜晚模式")}}
function mediaEmpty(label){return`<div class="media-empty">${icon(label.includes("视频")?"Video":"Image")}<strong>${label.includes("视频")?"暂无视频":"暂无图片"}</strong></div>`}
function syncInspector(){const node=getNode(app.selectedId);if(!node)return;$("#inspectorTitle").textContent=node.title;$("#titleField").value=node.title;$("#bodyField").value=node.body||"";$("#colorField").value=node.color}function renderMeta(){$("#nodeCountLabel").textContent=`${app.nodes.length} 个节点 · ${app.edges.length} 条连接`}function getNode(id){return app.nodes.find(n=>n.id===id)}
function setNodeSelection(ids){app.selectedEdgeId=null;app.selectedIds=ids;app.selectedId=ids.at(-1)||null;app.editingFrame=false;document.querySelectorAll(".node").forEach(el=>el.classList.toggle("selected",ids.includes(el.dataset.nodeId)));renderInspector();}
function selectNode(id,additive=false){setNodeSelection(additive?(app.selectedIds.includes(id)?app.selectedIds.filter(nodeId=>nodeId!==id):[...app.selectedIds,id]):[id]);}
function startNodeTitleEdit(event,id){
  if(app.presentation||event.shiftKey||app.titleEdit?.id===id)return;
  event.stopPropagation();finishNodeTitleEdit();flushHistory();selectNode(id);
  const node=getNode(id),label=nodeElement(id)?.querySelector(".node-title");if(!node||!label)return;
  const input=document.createElement("input");input.type="text";input.className="node-title-editor";
  input.value=node.title;input.setAttribute("aria-label","节点标题");input.autocomplete="off";input.spellcheck=false;
  app.titleEdit={id,label,input};label.classList.add("editing");label.title="";label.replaceChildren(input);
  input.addEventListener("input",()=>{if(app.selectedId===id){$("#titleField").value=input.value;$("#inspectorTitle").textContent=input.value;}});
  input.addEventListener("blur",()=>finishNodeTitleEdit());
  input.addEventListener("keydown",event=>{
    if(event.isComposing||event.keyCode===229)return;
    if(event.key==="Enter"||event.key==="Escape"){event.preventDefault();event.stopPropagation();finishNodeTitleEdit(event.key==="Enter");}
  });
  input.focus();input.select();
}
function finishNodeTitleEdit(commit=true){
  const edit=app.titleEdit;if(!edit)return;
  app.titleEdit=null;
  const node=getNode(edit.id);
  if(commit&&node&&node.title!==edit.input.value){flushHistory();node.title=edit.input.value;commitChange();}
  edit.label.classList.remove("editing");edit.label.textContent=node?.title||"";edit.label.title=node?.title||"";
  if(app.selectedId===edit.id)syncInspector();
}
function startMarquee(event,toggleId=null){
  if(app.presentation||event.button!==0)return;
  event.stopPropagation();event.preventDefault();closeCreationMenu();
  clearConnection();app.drag=null;app.frameDrag=null;app.panDrag=null;
  app.marquee={pointerId:event.pointerId,x:event.clientX,y:event.clientY,start:screenToWorld(event.clientX,event.clientY),moved:false,toggleId,selection:[...app.selectedIds],primary:app.selectedId,editingFrame:app.editingFrame};
  $("#canvasViewport").classList.add("selecting");
  $("#canvasViewport").setPointerCapture(event.pointerId);
}
function moveMarquee(event){
  const draft=app.marquee;if(!draft||draft.pointerId!==event.pointerId)return;
  if(!draft.moved&&Math.hypot(event.clientX-draft.x,event.clientY-draft.y)<5)return;
  draft.moved=true;
  const viewport=$("#canvasViewport").getBoundingClientRect(),clientX=Math.max(viewport.left,Math.min(viewport.right,event.clientX)),clientY=Math.max(viewport.top,Math.min(viewport.bottom,event.clientY));
  const point=screenToWorld(clientX,clientY),left=Math.min(draft.start.x,point.x),right=Math.max(draft.start.x,point.x),top=Math.min(draft.start.y,point.y),bottom=Math.max(draft.start.y,point.y);
  const selection=$("#selectionMarquee");selection.hidden=false;
  selection.style.left=`${Math.min(draft.x,clientX)-viewport.left}px`;selection.style.top=`${Math.min(draft.y,clientY)-viewport.top}px`;
  selection.style.width=`${Math.abs(clientX-draft.x)}px`;selection.style.height=`${Math.abs(clientY-draft.y)}px`;
  setNodeSelection(app.nodes.filter(node=>!collapsedGroupForNode(node.id)&&node.x<right&&node.x+node.w>left&&node.y<bottom&&node.y+nodeHeight(node)>top).map(node=>node.id));
}
function clearMarquee(restore=false){
  const draft=app.marquee;if(!draft)return;
  app.marquee=null;$("#selectionMarquee").hidden=true;
  const viewport=$("#canvasViewport");viewport.classList.remove("selecting");
  if(restore){setNodeSelection(draft.selection);app.selectedId=draft.primary;app.editingFrame=draft.editingFrame;renderInspector();}
  if(viewport.hasPointerCapture(draft.pointerId))viewport.releasePointerCapture(draft.pointerId);
}
function handleNodePointerDown(event,id){
  if(app.presentation||event.button!==0)return;
  if(event.target.closest(".node-title-editor")){event.stopPropagation();return;}
  const node=getNode(id),resizeHandle=event.target.closest(".node-resize-handle"),port=event.target.closest(".port");
  if(resizeHandle){startNodeResize(event,id,resizeHandle.dataset.resize);return;}
  if(port){event.stopPropagation();event.preventDefault();if(port.dataset.port==="out")startConnection(event,id);return;}
  if(event.shiftKey&&!event.target.closest("button,textarea,input,select,video,a,[contenteditable]")){startMarquee(event,id);return;}
  if(!app.selectedIds.includes(id)||app.selectedIds.length<2||!event.target.closest(".node-header"))selectNode(id,false);
  if(event.target.closest("button,textarea,input,select,video,a,[contenteditable]"))return;
  if(!event.target.closest(".node-header"))return;
  flushHistory();const point=screenToWorld(event.clientX,event.clientY);
  clearConnection();app.drag={id,point,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,moved:false,nodes:app.selectedIds.map(nodeId=>{const member=getNode(nodeId);return member?{id:nodeId,x:member.x,y:member.y}:null}).filter(Boolean)};
  event.preventDefault();
}
function handleViewportPointerDown(event){
  if(event.target.closest(".creation-menu,.presentation-bar,.canvas-frame-title,.frame-resize,.zoom-controls,.group-collapse-toggle,.collapsed-summary,.connection-item,.search-panel"))return;
  const isBlank=!event.target.closest(".node");
  if(!app.presentation&&isBlank&&event.button===0&&event.shiftKey){startMarquee(event);return;}
  if((event.button===0&&isBlank)||event.button===1){
    if(!app.presentation&&event.button===0){app.selectedEdgeId=null;app.selectedId=null;app.selectedIds=[];app.editingFrame=false;document.querySelectorAll(".node.selected").forEach(el=>el.classList.remove("selected"));renderInspector();}
    clearConnection();event.preventDefault();
    app.panDrag={x:event.clientX,y:event.clientY,panX:app.pan.x,panY:app.pan.y};
    event.currentTarget.setPointerCapture(event.pointerId);$("#canvasViewport").classList.add("panning");
  }
}
function updateCamera(){
  const viewport=$("#canvasViewport"),baseSpacing=24*app.scale;
  // Thin the grid at low zoom while its dot radius stays fixed in screen pixels.
  const spacing=baseSpacing*2**Math.max(0,Math.ceil(Math.log2(12/baseSpacing)));
  $("#canvasWorld").style.transform=`translate(${app.pan.x}px,${app.pan.y}px) scale(${app.scale})`;
  viewport.style.backgroundSize=`${spacing}px ${spacing}px`;
  viewport.style.backgroundPosition=`${app.pan.x}px ${app.pan.y}px`;
  $("#zoomValue").textContent=`${Math.round(app.scale*100)}%`;
}
function handlePointerMove(event){
  if(app.marquee){moveMarquee(event);return;}
  if(app.nodeResize){moveNodeResize(event);return;}
  if(app.frameDrag){moveFrameDrag(event);return;}
  if(app.connectDraft){moveConnection(event);return;}
  if(app.drag){
    if(event.pointerId!==app.drag.pointerId)return;
    if(!app.drag.moved){
      if(Math.hypot(event.clientX-app.drag.clientX,event.clientY-app.drag.clientY)<3)return;
      app.drag.moved=true;$("#canvasViewport").setPointerCapture(event.pointerId);
    }
    const p=screenToWorld(event.clientX,event.clientY),dx=p.x-app.drag.point.x,dy=p.y-app.drag.point.y;
    app.drag.nodes.forEach(start=>{const member=getNode(start.id);if(member){member.x=start.x+dx;member.y=start.y+dy;const el=nodeElement(member.id);el.style.left=`${member.x}px`;el.style.top=`${member.y}px`;}});renderConnections();
    return;
  }
  if(app.panDrag){app.pan.x=app.panDrag.panX+event.clientX-app.panDrag.x;app.pan.y=app.panDrag.panY+event.clientY-app.panDrag.y;updateCamera();}
}
function startNodeResize(event,id,direction){
  if(app.presentation||!resizeCursors[direction])return;
  event.stopPropagation();event.preventDefault();
  const node=getNode(id);if(!node)return;
  selectNode(id,false);flushHistory();closeCreationMenu();
  clearConnection();app.drag=null;app.frameDrag=null;app.panDrag=null;
  const point=screenToWorld(event.clientX,event.clientY);
  const height=nodeHeight(node),manualHeight=node.resized&&Number.isFinite(node.manualHeight)?node.manualHeight:height;
  app.nodeResize={id,direction,startX:point.x,startY:point.y,x:node.x,y:node.y,w:node.w,h:height,manualHeight};
  document.body.style.setProperty("--node-resize-cursor",resizeCursors[direction]);
  document.body.classList.add("node-resizing");
  $("#canvasViewport").setPointerCapture(event.pointerId);
}
function clearNodeResize(){app.nodeResize=null;document.body.classList.remove("node-resizing");document.body.style.removeProperty("--node-resize-cursor");}
function moveNodeResize(event){
  const resize=app.nodeResize,node=getNode(resize.id);if(!node)return;
  const point=screenToWorld(event.clientX,event.clientY),dx=point.x-resize.startX,dy=point.y-resize.startY;
  let w=resize.w,h=resize.manualHeight;
  if(resize.direction.includes("e"))w=Math.max(NODE_MIN_WIDTH,resize.w+dx);
  if(resize.direction.includes("s"))h=Math.max(NODE_MIN_HEIGHT,resize.h+dy);
  if(resize.direction.includes("w"))w=Math.max(NODE_MIN_WIDTH,resize.w-dx);
  if(resize.direction.includes("n"))h=Math.max(NODE_MIN_HEIGHT,resize.h-dy);
  node.w=w;node.h=h;node.resized=true;node.manualHeight=h;
  const el=nodeElement(node.id);
  if(el){
    el.style.width=`${w}px`;el.style.height=`${h}px`;el.style.minHeight=`${h}px`;
    resizeNodeEditor(el.querySelector(".node-editor"),node);
    node.x=resize.direction.includes("w")?resize.x+resize.w-node.w:resize.x;
    node.y=resize.direction.includes("n")?resize.y+resize.h-node.h:resize.y;
    el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;
  }
  renderConnections();
}
function startConnection(event,fromId){
  if(app.presentation||event.button!==0)return;
  clearConnection();closeCreationMenu();
  app.connectDraft={fromId,style:app.edgeStyle,pointerId:event.pointerId,point:null,targetId:null};
  const viewport=$("#canvasViewport");viewport.classList.add("connecting");viewport.setPointerCapture(event.pointerId);
  nodeElement(fromId)?.querySelector(".port-out").classList.add("connection-source");
  renderDraftConnection();
}
function connectionTarget(event){
  const port=document.elementFromPoint(event.clientX,event.clientY)?.closest(".port-in"),id=port?.closest(".node")?.dataset.nodeId;
  return id&&id!==app.connectDraft?.fromId&&getNode(id)?id:null;
}
function moveConnection(event){
  const draft=app.connectDraft;if(!draft||draft.pointerId!==event.pointerId)return;
  draft.point=screenToWorld(event.clientX,event.clientY);
  const targetId=connectionTarget(event);
  if(targetId!==draft.targetId){
    if(draft.targetId)nodeElement(draft.targetId)?.querySelector(".port-in").classList.remove("connection-target");
    draft.targetId=targetId;
    if(targetId)nodeElement(targetId)?.querySelector(".port-in").classList.add("connection-target");
  }
  renderDraftConnection();
}
function clearConnection(){
  const draft=app.connectDraft;app.connectDraft=null;
  $("#connectionPreview")?.remove();
  document.querySelectorAll(".connection-source,.connection-target").forEach(port=>port.classList.remove("connection-source","connection-target"));
  const viewport=$("#canvasViewport");viewport.classList.remove("connecting");
  if(draft&&viewport.hasPointerCapture(draft.pointerId))viewport.releasePointerCapture(draft.pointerId);
}
function connectionCurve(x1,y1,x2,y2){
  const bend=Math.max(24,Math.min(70,Math.hypot(x2-x1,y2-y1)*.5),Math.abs(x2-x1)*.48);
  return `M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`;
}
function renderDraftConnection(){
  const draft=app.connectDraft;if(!draft)return;
  const from=getNode(draft.fromId);if(!from){clearConnection();return;}
  let preview=$("#connectionPreview");
  if(!preview){
    preview=document.createElementNS("http://www.w3.org/2000/svg","svg");preview.id="connectionPreview";preview.setAttribute("class","connection-layer connection-preview");preview.setAttribute("aria-hidden","true");
    preview.innerHTML='<defs><marker id="draftArrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z"/></marker></defs><path id="draftConnection"/>';
    $("#canvasWorld").append(preview);
  }
  const x=from.x+from.w+4,y=from.y+nodeHeight(from)/2,to=getNode(draft.targetId),end=to?{x:to.x-4,y:to.y+nodeHeight(to)/2}:draft.point||{x:x+48,y};
  const path=$("#draftConnection");path.setAttribute("class",`draft-connection${draft.style==="dashed"?" dashed":""}`);path.setAttribute("d",connectionCurve(x,y,end.x,end.y));
}
function screenToWorld(clientX,clientY){const rect=$("#canvasViewport").getBoundingClientRect();return{x:(clientX-rect.left-app.pan.x)/app.scale,y:(clientY-rect.top-app.pan.y)/app.scale}}
function handleWheel(event){if(app.marquee||app.connectDraft){event.preventDefault();return;}if(event.target.closest("textarea,video,.creation-menu,.presentation-bar,.zoom-controls,.search-panel"))return;event.preventDefault();const rect=$("#canvasViewport").getBoundingClientRect(),cursorX=event.clientX-rect.left,cursorY=event.clientY-rect.top,before={x:(cursorX-app.pan.x)/app.scale,y:(cursorY-app.pan.y)/app.scale},next=Math.min(2,Math.max(.05,app.scale*(event.deltaY<0?1.08:.92)));app.scale=next;app.pan.x=cursorX-before.x*next;app.pan.y=cursorY-before.y*next;updateCamera()}
function setZoom(value){app.scale=Math.min(2,Math.max(.1,value));updateCamera();}
function addNode(type,overrides={}){if(app.presentation)return;flushHistory();const rect=$("#canvasViewport").getBoundingClientRect(),point=screenToWorld(rect.left+rect.width/2,rect.top+rect.height/2),offset=app.nodes.length*18,node=makeNode(type,{x:point.x-120+(offset%90),y:point.y-80+(offset%70),...overrides});app.nodes.push(node);app.selectedId=node.id;app.selectedIds=[node.id];app.editingFrame=false;render();commitChange();showToast(`${typeLabel(type)}节点已添加`)}
function handleDrop(event){event.preventDefault();$("#dropHint").textContent="拖入图片或视频到画布";[...event.dataTransfer.files].filter(f=>f.type.startsWith("image/")||f.type.startsWith("video/")).slice(0,3).forEach(f=>readMediaFile(f,f.type.startsWith("image/")?"image":"video"))}
function handlePaste(event){const item=[...(event.clipboardData?.items||[])].find(e=>e.type.startsWith("image/"));if(item){const file=item.getAsFile();if(file){event.preventDefault();readMediaFile(file,"image");showToast("已从剪贴板添加图片")}}}
function updateSelectedFromInspector(){const node=getNode(app.selectedId);if(!node||app.presentation)return;node.title=$("#titleField").value;node.body=$("#bodyField").value;node.color=$("#colorField").value;const el=nodeElement(node.id);el.querySelector(".node-title").textContent=node.title;el.className=`node ${node.type==="text"||node.type==="other"?"text-node":"media-node"} color-${node.color} selected`;const editor=el.querySelector(".node-editor");if(editor){if(editor.value!==node.body)editor.value=node.body;resizeNodeEditor(editor,node);}$("#inspectorTitle").textContent=node.title;renderConnections();scheduleSave()}
function deleteSelected(){if(app.presentation)return;const ids=app.selectedIds.length?app.selectedIds:[app.selectedId].filter(Boolean);if(ids.length===1){removeNode(ids[0]);return;}if(!ids.length)return;flushHistory();app.nodes=app.nodes.filter(node=>!ids.includes(node.id));app.edges=app.edges.filter(edge=>!ids.includes(edge.from)&&!ids.includes(edge.to));app.frames.forEach(frame=>{frame.nodeIds=(frame.nodeIds||[]).filter(nodeId=>!ids.includes(nodeId));});app.selectedId=null;app.selectedIds=[];render();commitChange();showToast(`已删除 ${ids.length} 个节点`)}
function removeNode(id){if(app.presentation)return;flushHistory();app.nodes=app.nodes.filter(n=>n.id!==id);app.edges=app.edges.filter(e=>e.from!==id&&e.to!==id);app.frames.forEach(frame=>{frame.nodeIds=(frame.nodeIds||[]).filter(nodeId=>nodeId!==id);});app.selectedIds=app.selectedIds.filter(nodeId=>nodeId!==id);if(app.selectedId===id)app.selectedId=app.selectedIds.at(-1)||null;render();commitChange();showToast("节点已删除")}
function resetBoard(){flushHistory();clearConnection();app.nodes=[];app.edges=[];app.frames=[];app.activeFrameId=null;app.selectedId=null;app.selectedIds=[];app.editingFrame=false;app.scale=1;setInitialView();render();commitChange();saveBoard(false);showToast("已新建空白画布")}
let saveTimer;
function fitBoard(){if(!app.nodes.length)return;const rect=$("#canvasViewport").getBoundingClientRect(),bounds=app.nodes.reduce((a,n)=>({left:Math.min(a.left,n.x),top:Math.min(a.top,n.y),right:Math.max(a.right,n.x+n.w),bottom:Math.max(a.bottom,n.y+n.h)}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity}),width=bounds.right-bounds.left+120,height=bounds.bottom-bounds.top+120;app.scale=Math.min(1.25,Math.max(.5,Math.min(rect.width/width,rect.height/height)));app.pan.x=(rect.width-width*app.scale)/2-(bounds.left-60)*app.scale;app.pan.y=(rect.height-height*app.scale)/2-(bounds.top-60)*app.scale;render();showToast("已适应画布")}
document.addEventListener("keyup",event=>{if(event.code==="Space")app.space=false});
function typeLabel(type){return type==="text"?"文本":type==="image"?"图片":type==="video"?"视频":type==="document"?"文档":"其他"}
function nodeBodyMarkup(node){if(node.type==="text"||node.type==="other")return`<textarea class="node-body node-editor" data-editable="true" aria-label="节点说明">${escapeHtml(node.body)}</textarea>`;if(node.type==="image")return`<div class="node-body">${node.src?`<img class="media-preview" src="${escapeAttr(node.src===SAMPLE_IMAGE?window.CANVAS_SAMPLE_IMAGE:node.src)}" alt="${escapeAttr(node.title)}" />`:mediaEmpty("图片")}</div>`;if(node.type==="video")return`<div class="node-body">${node.src?`<video class="media-preview" src="${escapeAttr(node.src)}" controls></video>`:mediaEmpty("视频")}</div>`;return documentMarkup(node);}
function nodeElement(id){return [...$("#nodesLayer").children].find(el=>el.dataset.nodeId===id);}
function resizeNodeEditor(editor,node){
  if(!editor||!node)return;
  const article=editor.closest(".node");if(!article)return;
  // Older saved nodes store only their effective height after a manual resize.
  if(node.resized&&!Number.isFinite(node.manualHeight))node.manualHeight=node.h;
  const minimum=node.resized?Math.max(NODE_MIN_HEIGHT,node.manualHeight):typeDefaults[node.type].h;
  article.style.height="auto";article.style.minHeight="0px";
  editor.style.height="0px";
  const textHeight=Math.max(44,editor.scrollHeight);
  editor.style.height=`${textHeight}px`;
  const contentHeight=article.offsetHeight;
  node.h=Math.ceil(Math.max(minimum,contentHeight));
  article.style.height=`${node.h}px`;article.style.minHeight=`${node.h}px`;
  editor.style.height=`${textHeight+node.h-contentHeight}px`;
}
function nodeHeight(node){return nodeElement(node.id)?.offsetHeight||node.h;}
function isNodeInFrame(node,frame){if(isGroup(frame))return(frame.nodeIds||[]).includes(node.id);return Boolean(frame&&((frame.nodeIds||[]).includes(node.id)||(node.x>=frame.x&&node.y>=frame.y&&node.x+node.w<=frame.x+frame.w&&node.y+nodeHeight(node)<=frame.y+frame.h)));}
function renderNodes(){
  finishNodeTitleEdit();
  const layer=$("#nodesLayer");
  layer.innerHTML=app.nodes.map(node=>`<article class="node ${node.type==="text"||node.type==="other"?"text-node":"media-node"} color-${node.color} ${app.selectedIds.includes(node.id)?"selected":""}" data-node-id="${escapeAttr(node.id)}" style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;min-height:${node.h}px"><span class="port port-in" data-port="in" title="连接到此节点"></span><div class="node-header"><span class="node-type-dot"></span><span class="node-title">${escapeHtml(node.title)}</span><span class="node-kind">${typeLabel(node.type)}</span><button class="node-menu" data-action="delete" title="删除节点" aria-label="删除节点">${icon("X")}</button></div>${nodeBodyMarkup(node)}${node.fileName&&node.type!=="document"?`<div class="node-caption">${escapeHtml(node.fileName)}</div>`:""}<span class="port port-out" data-port="out" title="连接到目标输入点"></span>${["nw","n","ne","e","se","s","sw","w"].map(direction=>`<span class="node-resize-handle resize-${direction}" data-resize="${direction}" title="调整节点大小"></span>`).join("")}</article>`).join("");
  layer.querySelectorAll(".node").forEach(el=>{
    const id=el.dataset.nodeId;
    el.hidden=Boolean(collapsedGroupForNode(id))||Boolean(app.presentation&&getFrame(app.activeFrameId)?.reveal&&!presentationNodeVisible(id));
    el.classList.toggle("presentation-muted",app.presentation&&!isNodeInFrame(getNode(id),getFrame(app.activeFrameId)));
    el.addEventListener("pointerdown",event=>handleNodePointerDown(event,id));
    const title=el.querySelector(".node-title");title.title=getNode(id).title;
    title.addEventListener("dblclick",event=>startNodeTitleEdit(event,id));
    const editor=el.querySelector(".node-editor");
    if(editor){
      editor.readOnly=app.presentation;
      if(!el.hidden)resizeNodeEditor(editor,getNode(id));
      editor.addEventListener("focus",()=>{if(!app.presentation)selectNode(id);});
      editor.addEventListener("input",()=>{if(app.presentation)return;const node=getNode(id);node.body=editor.value;resizeNodeEditor(editor,node);syncInspector();renderConnections();scheduleSave();});
    }
    el.querySelector('[data-action="delete"]').addEventListener("click",event=>{event.stopPropagation();if(!app.presentation)removeNode(id);});
    el.querySelector("[data-document-preview]")?.addEventListener("click",()=>previewDocument(id));
    el.querySelector("[data-document-download]")?.addEventListener("click",()=>downloadDocument(id));
    el.querySelector("[data-document-attach]")?.addEventListener("click",()=>{app.pendingUploadId=id;$("#documentInput").click();});
    el.querySelectorAll("img,video").forEach(media=>media.addEventListener("load",renderConnections));
    el.querySelector("video")?.addEventListener("loadedmetadata",renderConnections);
  });
}
function handleCanvasDoubleClick(event){if(app.presentation||event.shiftKey||event.target.closest(".node,.creation-menu,.canvas-frame-title,.frame-resize,.presentation-bar,.zoom-controls,.group-collapse-toggle,.collapsed-summary,.connection-item,.search-panel"))return;clearConnection();const point=screenToWorld(event.clientX,event.clientY);showCreationMenu(event.clientX,event.clientY,{x:point.x,y:point.y,fromId:null})}
function showCreationMenu(clientX,clientY,pending){const rect=$("#canvasViewport").getBoundingClientRect(),menu=$("#creationMenu");app.pendingCreation=pending;menu.hidden=false;menu.style.left=`${Math.max(12,Math.min(rect.width-226,clientX-rect.left-18))}px`;menu.style.top=`${Math.max(12,Math.min(rect.height-300,clientY-rect.top-18))}px`}
function closeCreationMenu(){const menu=$("#creationMenu");if(menu)menu.hidden=true;app.pendingCreation=null}
function chooseCreationType(type){const pending=app.pendingCreation;if(!pending||app.presentation)return;flushHistory();closeCreationMenu();const node=createNodeAt(type,{x:pending.x,y:pending.y});app.selectedId=node.id;app.selectedIds=[node.id];app.editingFrame=false;render();commitChange();if(type==="image"||type==="video"||type==="document"){app.pendingUploadId=node.id;$(type==="image"?"#imageInput":type==="video"?"#videoInput":"#documentInput").click()}else{nodeElement(node.id).querySelector(".node-editor")?.focus();showToast(`${typeLabel(type)}节点已创建`)}}
function createNodeAt(type,point){const defaults=typeDefaults[type]||typeDefaults.other,node=makeNode(type,{x:point.x-defaults.w/2,y:point.y-30});app.nodes.push(node);return node;}
function readMediaFile(file,type,targetId){if(!file||app.presentation)return;const boardId=boardLibrary.currentId,reader=new FileReader();app.pendingReads=(app.pendingReads||0)+1;reader.onloadend=()=>{app.pendingReads=Math.max(0,app.pendingReads-1);};reader.onerror=()=>showToast("文件读取失败，请重试");reader.onload=()=>{if(boardLibrary.currentId!==boardId){showToast("画布已切换，请在目标画布重新添加文件");return;}const node=targetId?getNode(targetId):null;if(targetId&&!node)return;flushHistory();const details={title:file.name.replace(/\.[^.]+$/," ").trim()||typeDefaults[type].title,src:reader.result,fileName:file.name,mimeType:file.type,fileSize:file.size};if(node){Object.assign(node,details);render();commitChange();showToast(`${typeLabel(type)}已添加`)}else{const point=screenToWorld($("#canvasViewport").getBoundingClientRect().left+220,$("#canvasViewport").getBoundingClientRect().top+180);addNode(type,{...details,x:point.x,y:point.y})}};reader.readAsDataURL(file);["imageInput","videoInput","documentInput"].forEach(id=>document.getElementById(id).value="");}
function handlePointerUp(event){
  if(app.marquee){
    if(event.pointerId!==app.marquee.pointerId)return;
    if(event.type==="pointercancel"){clearMarquee(true);return;}
    moveMarquee(event);const draft=app.marquee;
    clearMarquee();if(!draft.moved&&draft.toggleId)selectNode(draft.toggleId,true);
    return;
  }
  if(app.connectDraft){
    if(event.pointerId!==app.connectDraft.pointerId)return;
    const {fromId,style}=app.connectDraft,toId=event.type==="pointercancel"?null:connectionTarget(event);
    clearConnection();
    if(toId&&!app.edges.some(edge=>edge.from===fromId&&edge.to===toId)){
      flushHistory();app.edges.push({id:uid("edge"),from:fromId,to:toId,style});commitChange();renderConnections();renderInspector();renderMeta();
    }
    return;
  }
  if(app.nodeResize){commitChange();renderInspector();}
  if(app.drag?.moved||app.frameDrag){commitChange();renderInspector();}
  clearNodeResize();app.drag=null;app.frameDrag=null;app.panDrag=null;$("#canvasViewport").classList.remove("panning");
}
function renderConnections(){renderEnhancedConnections();renderDraftConnection();}
function renderInspector(){
  if(app.selectedId||app.editingFrame)app.selectedEdgeId=null;
  syncFrameSelection();
  const multiple=app.selectedIds.length>1,node=multiple?null:getNode(app.selectedId),frame=app.editingFrame?getFrame(app.activeFrameId):null;
  $("#inspectorEmpty").hidden=Boolean(node||frame);$("#inspectorForm").hidden=!node;$("#chapterForm").hidden=!frame;
  $("#deleteSelectedButton").hidden=Boolean(frame);$("#deleteSelectedButton").disabled=!node&&!multiple;
  $("#inspectorTitle").textContent=frame?frame.title:multiple?`${app.selectedIds.length} 个节点已选择`:node?node.title:"画布属性";$("#edgeStyleField").value=app.edgeStyle;syncAppearanceControls();
  if(frame){const group=isGroup(frame);$("#frameTitleLabel").textContent=group?"编组名称":"章节名称";$("#frameNotesLabel").textContent=group?"编组备注":"讲解备注";$("#frameTitleField").value=frame.title;$("#frameNotesField").value=frame.notes||"";$("#frameWidthField").value=Math.round(frame.w);$("#frameHeightField").value=Math.round(frame.h);const chapters=chapterFrames(),index=chapters.indexOf(frame);$("#frameUpButton").hidden=group;$("#frameDownButton").hidden=group;$("#frameUpButton").disabled=index<=0;$("#frameDownButton").disabled=index<0||index===chapters.length-1;}
  renderFeatureInspector(frame);
  if(!node)return;
  $("#titleField").value=node.title;$("#bodyField").value=node.body||"";$("#colorField").value=node.color;syncAppearanceControls();
  const incoming=app.edges.filter(e=>e.to===node.id).length,outgoing=app.edges.filter(e=>e.from===node.id).length;
  $("#nodeFacts").textContent=`类型：${typeLabel(node.type)}\n连入：${incoming} 条 · 连出：${outgoing} 条`;
}
function closeExportMenu(restoreFocus=false){const menu=$("#exportMenu"),wasOpen=!menu.hidden;menu.hidden=true;$(".topbar").classList.remove("export-menu-open");$("#exportButton").setAttribute("aria-expanded","false");if(wasOpen&&restoreFocus)$("#exportButton").focus();}
function toggleExportMenu(){
  const menu=$("#exportMenu");if(!menu.hidden){closeExportMenu(true);return;}
  menu.style.right=`${Math.max(12,innerWidth-$("#exportButton").getBoundingClientRect().right)}px`;
  menu.hidden=false;$(".topbar").classList.add("export-menu-open");$("#exportButton").setAttribute("aria-expanded","true");menu.querySelector("button").focus();
}
function handleExportMenuKeydown(event){
  if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  event.preventDefault();const items=[...event.currentTarget.querySelectorAll("button")],index=items.indexOf(document.activeElement);
  items[event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length].focus();
}
function downloadBoardFile(blob,extension){
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download=`DYcanvas-${new Date().toISOString().slice(0,10)}.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportBoard(){finishNodeTitleEdit();downloadBoardFile(new Blob([JSON.stringify({...currentBoardData(),exportedAt:new Date().toISOString()},null,2)],{type:"application/json"}),"json");showToast("画布 JSON 已导出")}
function imageExportBounds(){
  const boxes=app.nodes.filter(node=>!collapsedGroupForNode(node.id)).map(node=>({x:node.x,y:node.y,w:node.w,h:nodeHeight(node)}));
  app.frames.forEach(frame=>{const box=frameDisplayBox(frame);boxes.push({x:box.x,y:box.y-40,w:box.w,h:box.h+40});});
  $("#connections").querySelectorAll(".connection-path,.connection-label").forEach(path=>{const box=path.getBBox();boxes.push({x:box.x,y:box.y,w:box.width,h:box.height});});
  if(!boxes.length)return null;
  const left=Math.floor(Math.min(...boxes.map(box=>box.x)))-48,top=Math.floor(Math.min(...boxes.map(box=>box.y)))-48;
  const right=Math.ceil(Math.max(...boxes.map(box=>box.x+box.w)))+48,bottom=Math.ceil(Math.max(...boxes.map(box=>box.y+box.h)))+48;
  const width=right-left,height=bottom-top;
  return{left,top,width,height,pixelRatio:Math.min(2,8192/width,8192/height,Math.sqrt(32000000/(width*height)))};
}
function mediaFrameDataURL(media){
  const canvas=document.createElement("canvas");canvas.width=media.naturalWidth||media.videoWidth;canvas.height=media.naturalHeight||media.videoHeight;
  canvas.getContext("2d").drawImage(media,0,0);return canvas.toDataURL("image/png");
}
async function videoFrameDataURL(source){
  // Decode separately so off-screen videos export without changing playback.
  const video=document.createElement("video"),time=source.currentTime;
  video.muted=true;video.preload="auto";video.playsInline=true;video.setAttribute("aria-hidden","true");
  video.style.cssText="position:fixed;left:-100000px;top:0;width:160px;height:90px;pointer-events:none";
  document.body.append(video);
  const waitFor=(event,start)=>new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener("error",failed);};
    const done=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new Error("Video frame unavailable"));};
    const timer=setTimeout(failed,8000);video.addEventListener(event,done);video.addEventListener("error",failed);
    try{start();}catch(error){cleanup();reject(error);}
  });
  try{
    await waitFor("loadedmetadata",()=>{video.src=source.currentSrc||source.src;});
    const target=Math.min(Math.max(.000001,time),Number.isFinite(video.duration)?Math.max(.000001,video.duration-.000001):time);
    await waitFor("seeked",()=>{video.currentTime=target;});
    return mediaFrameDataURL(video);
  }finally{video.removeAttribute("src");video.load();video.remove();}
}
async function prepareImageExport(bounds){
  const host=document.createElement("div"),scene=document.createElement("div"),world=$("#canvasWorld").cloneNode(true);
  host.className="canvas-export-host";host.setAttribute("aria-hidden","true");scene.className="canvas-export-scene";
  const viewportStyle=getComputedStyle($("#canvasViewport"));
  Object.assign(scene.style,{width:`${bounds.width}px`,height:`${bounds.height}px`,backgroundColor:viewportStyle.backgroundColor,backgroundImage:viewportStyle.backgroundImage,backgroundSize:"24px 24px",backgroundPosition:`${-bounds.left}px ${-bounds.top}px`});
  world.style.transform=`translate(${-bounds.left}px,${-bounds.top}px)`;world.style.transition="none";
  world.querySelectorAll(".port,.node-menu,.node-resize-handle,.frame-resize,.canvas-empty-hint,#connectionPreview,.connection-hit,.group-collapse-toggle,.document-actions").forEach(el=>el.remove());
  world.querySelectorAll(".selected,.active,.presentation-muted,.search-highlight").forEach(el=>el.classList.remove("selected","active","presentation-muted","search-highlight"));
  world.querySelectorAll(".canvas-frame-title").forEach(el=>{el.disabled=false;el.removeAttribute("aria-pressed");});
  world.querySelectorAll("textarea").forEach(editor=>{
    const source=nodeElement(editor.closest(".node").dataset.nodeId).querySelector("textarea"),text=document.createElement("div");
    text.className=editor.className;text.style.cssText=editor.style.cssText;text.textContent=source.value;editor.replaceWith(text);
  });
  const originals=[...$("#canvasWorld").querySelectorAll("img,video")],copies=[...world.querySelectorAll("img,video")];
  await Promise.all(originals.map(async(media,index)=>{
    const copy=copies[index];
    if(media.closest("[hidden]")){copy.remove();return;}
    if(media.tagName==="IMG"){
      await media.decode();copy.src=media.src.startsWith("data:")?media.src:mediaFrameDataURL(media);copy.removeAttribute("srcset");
    }else if(media.readyState>=2&&media.videoWidth){
      const image=document.createElement("img");image.className=copy.className;image.src=await videoFrameDataURL(media);copy.replaceWith(image);
    }else{
      const placeholder=document.createElement("div");placeholder.className="media-empty";placeholder.innerHTML=`${icon("Video")}<strong>本地视频</strong>`;copy.replaceWith(placeholder);
    }
  }));
  world.querySelectorAll("[id]").forEach(el=>{if(el.id==="arrowhead"){el.id="exportArrowhead";el.querySelector("path").style.fill=viewportStyle.getPropertyValue("--edge");}else el.removeAttribute("id");});
  world.querySelectorAll(".connection-path").forEach(path=>path.style.markerEnd="url(#exportArrowhead)");
  scene.append(world);host.append(scene);document.body.append(host);
  // Preserve SVG presentation rules when the image renderer clones the scene.
  scene.querySelectorAll("svg,svg *").forEach(el=>{
    const style=getComputedStyle(el);
    for(const property of style)if(!property.startsWith("--"))el.style.setProperty(property,style.getPropertyValue(property));
  });
  return{host,scene};
}
let imageExportPending=false;
async function exportBoardImage(){
  if(imageExportPending)return;finishNodeTitleEdit();const bounds=imageExportBounds();
  if(!bounds){showToast("画布暂无内容，请先添加节点");return;}
  imageExportPending=true;$("#exportButton").disabled=true;$("#exportButton").setAttribute("aria-busy","true");showToast("正在导出图片…");
  let capture;
  try{
    capture=await prepareImageExport(bounds);
    const blob=await htmlToImage.toBlob(capture.scene,{width:bounds.width,height:bounds.height,pixelRatio:bounds.pixelRatio,skipFonts:true});
    if(!blob)throw new Error("Empty image");
    downloadBoardFile(blob,"png");showToast("画布 PNG 图片已导出");
  }catch(error){console.error("Canvas image export failed",error);showToast("图片导出失败，请确认媒体已加载后重试");}
  finally{capture?.host.remove();imageExportPending=false;$("#exportButton").disabled=false;$("#exportButton").removeAttribute("aria-busy");}
}
function importBoard(event){const file=event.target.files[0];event.target.value="";return importLibraryBoard(file);}
function makeFrame(title,nodes,kind="chapter"){
  const list=(nodes||[]).filter(Boolean);
  const rect=$("#canvasViewport").getBoundingClientRect();
  const center=screenToWorld(rect.left+rect.width/2,rect.top+rect.height/2);
  const bounds=list.length?list.reduce((a,n)=>({left:Math.min(a.left,n.x),top:Math.min(a.top,n.y),right:Math.max(a.right,n.x+n.w),bottom:Math.max(a.bottom,n.y+nodeHeight(n))}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity}):{left:center.x-250,top:center.y-150,right:center.x+250,bottom:center.y+150};
  const padding=kind==="group"?24:40,topPadding=kind==="group"?38:50,minWidth=kind==="group"?280:360,minHeight=kind==="group"?190:260;
  return{id:uid("frame"),kind,title,x:bounds.left-padding,y:bounds.top-topPadding,w:Math.max(minWidth,bounds.right-bounds.left+padding*2),h:Math.max(minHeight,bounds.bottom-bounds.top+topPadding+padding),nodeIds:list.map(n=>n.id),notes:""};
}
function addFrameFromCurrent(){
  if(app.presentation)return;
  flushHistory();
  const rect=$("#canvasViewport").getBoundingClientRect();
  const left=screenToWorld(rect.left,rect.top),right=screenToWorld(rect.right,rect.bottom);
  const visible=app.nodes.filter(n=>n.x+n.w>left.x&&n.x<right.x&&n.y+nodeHeight(n)>left.y&&n.y<right.y);
  const selected=app.selectedIds.map(id=>getNode(id)).filter(Boolean),frame=makeFrame(`第 ${chapterFrames().length+1} 章`,selected.length?selected:visible,"chapter");
  app.frames.push(frame);app.activeFrameId=frame.id;app.selectedId=null;app.selectedIds=[];app.editingFrame=true;
  commitChange();render();fitFrame(frame);showToast("章节已创建");
}
function groupSelectedNodes(){
  if(app.presentation)return;
  const nodes=app.selectedIds.map(id=>getNode(id)).filter(Boolean);
  if(!nodes.length){showToast("请先按住 Shift 拖动框选节点");return;}
  flushHistory();const group=makeFrame("新建编组",nodes,"group");app.frames.push(group);app.activeFrameId=group.id;app.selectedId=null;app.selectedIds=[];app.editingFrame=true;commitChange();render();fitFrame(group);showToast(`已将 ${nodes.length} 个节点编组`);
}
function renderFrames(){
  const layer=$("#framesLayer");
  layer.innerHTML=app.frames.map(frame=>{const index=chapterFrames().indexOf(frame)+1,label=isGroup(frame)?frame.title:`${String(index).padStart(2,"0")} ${frame.title}`,box=frameDisplayBox(frame),collapsed=isGroup(frame)&&frame.collapsed&&!app.presentation;return`<div class="canvas-frame ${isGroup(frame)?"group-frame":"chapter-frame"} ${collapsed?"collapsed":""} ${app.activeFrameId===frame.id?"active":""}" data-frame-id="${escapeAttr(frame.id)}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"><button class="canvas-frame-title" title="拖动${isGroup(frame)?"编组":"章节"}" ${app.presentation?"disabled":""}>${icon(isGroup(frame)?"Group":"SquareDashed")}<span>${escapeHtml(label)}</span></button>${isGroup(frame)&&!app.presentation?`<button class="group-collapse-toggle icon-button" title="${collapsed?"展开编组":"折叠编组"}" aria-label="${collapsed?"展开编组":"折叠编组"}" aria-expanded="${!collapsed}">${icon(collapsed?"ChevronDown":"ChevronUp")}</button>`:""}${collapsed?`<div class="collapsed-summary"><strong>${(frame.nodeIds||[]).filter(id=>getNode(id)).length} 个节点</strong><span>${escapeHtml((frame.nodeIds||[]).map(id=>getNode(id)?.title).filter(Boolean).slice(0,3).join(" · "))}</span></div>`:""}<button class="frame-resize" title="调整${isGroup(frame)?"编组":"章节"}大小" ${app.presentation||collapsed?"hidden":""}></button></div>`}).join("");
  layer.querySelectorAll(".canvas-frame").forEach(el=>{
    el.querySelector(".canvas-frame-title").addEventListener("pointerdown",event=>startFrameDrag(event,el.dataset.frameId,false));
    el.querySelector(".frame-resize").addEventListener("pointerdown",event=>startFrameDrag(event,el.dataset.frameId,true));
    el.querySelector(".group-collapse-toggle")?.addEventListener("click",event=>{event.stopPropagation();toggleGroupCollapse(el.dataset.frameId);});
    el.querySelector(".collapsed-summary")?.addEventListener("pointerdown",event=>startFrameDrag(event,el.dataset.frameId,false));
    el.querySelector(".collapsed-summary")?.addEventListener("dblclick",event=>{event.stopPropagation();toggleGroupCollapse(el.dataset.frameId);});
  });
  syncFrameSelection();
}
function syncFrameSelection(){
  document.querySelectorAll(".canvas-frame").forEach(el=>{
    const selected=!app.presentation&&Boolean(app.editingFrame)&&el.dataset.frameId===app.activeFrameId;
    el.classList.toggle("selected",selected);
    el.querySelector(".canvas-frame-title").setAttribute("aria-pressed",String(selected));
  });
}
function renderFrameList(){const list=$("#frameList"),chapters=chapterFrames();list.innerHTML=chapters.map((frame,index)=>`<button class="frame-item ${app.activeFrameId===frame.id?"active":""}" data-frame-id="${escapeAttr(frame.id)}"><span class="frame-index">${index+1}</span><span class="frame-name">${escapeHtml(frame.title)}</span></button>`).join("");list.querySelectorAll("[data-frame-id]").forEach(button=>button.addEventListener("click",()=>{flushHistory();app.activeFrameId=button.dataset.frameId;app.selectedId=null;app.selectedIds=[];app.editingFrame=true;render();fitFrame(getFrame(app.activeFrameId))}))}
function getFrame(id){return app.frames.find(frame=>frame.id===id)}
function updateFrameFromInspector(){
  const frame=getFrame(app.activeFrameId);if(!frame||app.presentation)return;
  frame.title=$("#frameTitleField").value;frame.notes=$("#frameNotesField").value;
  const width=Number($("#frameWidthField").value),height=Number($("#frameHeightField").value);
  if(width>=240&&width<=20000)frame.w=width;if(height>=180&&height<=20000)frame.h=height;
  $("#inspectorTitle").textContent=frame.title;renderFrames();renderFrameList();scheduleSave();
}
function reorderFrame(direction){if(app.presentation)return;const chapters=chapterFrames(),index=chapters.findIndex(frame=>frame.id===app.activeFrameId),next=index+direction;if(index<0||next<0||next>=chapters.length)return;flushHistory();const first=app.frames.indexOf(chapters[index]),second=app.frames.indexOf(chapters[next]);[app.frames[first],app.frames[second]]=[app.frames[second],app.frames[first]];commitChange();render();}
function deleteFrame(){if(app.presentation)return;const removed=getFrame(app.activeFrameId);if(!removed)return;flushHistory();app.frames=app.frames.filter(frame=>frame.id!==app.activeFrameId);app.activeFrameId=chapterFrames()[0]?.id||app.frames[0]?.id||null;app.selectedId=null;app.selectedIds=[];app.editingFrame=Boolean(app.activeFrameId);commitChange();render();showToast(isGroup(removed)?"已删除编组，节点仍保留":"已删除章节框，内容仍保留");}
function startFrameDrag(event,id,resize){
  if(app.presentation||event.button!==0)return;event.stopPropagation();event.preventDefault();flushHistory();
  event.currentTarget.focus({preventScroll:true});
  const frame=getFrame(id),point=screenToWorld(event.clientX,event.clientY);
  app.activeFrameId=id;app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;app.editingFrame=true;
  document.querySelectorAll(".node.selected").forEach(el=>el.classList.remove("selected"));
  const members=app.nodes.filter(node=>isNodeInFrame(node,frame));
  app.frameDrag={id,resize,point,x:frame.x,y:frame.y,w:frame.w,h:frame.h,nodes:members.map(n=>({id:n.id,x:n.x,y:n.y}))};
  $("#canvasViewport").setPointerCapture(event.pointerId);renderInspector();renderFrameList();
}
function moveFrameDrag(event){
  const drag=app.frameDrag,frame=getFrame(drag.id),point=screenToWorld(event.clientX,event.clientY),dx=point.x-drag.point.x,dy=point.y-drag.point.y;
  if(drag.resize){frame.w=Math.max(240,drag.w+dx);frame.h=Math.max(180,drag.h+dy);}else{frame.x=drag.x+dx;frame.y=drag.y+dy;drag.nodes.forEach(start=>{const node=getNode(start.id);if(node){node.x=start.x+dx;node.y=start.y+dy;const el=nodeElement(node.id);el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;}});}
  const el=[...$("#framesLayer").children].find(el=>el.dataset.frameId===frame.id),box=frameDisplayBox(frame);el.style.left=`${box.x}px`;el.style.top=`${box.y}px`;el.style.width=`${box.w}px`;el.style.height=`${box.h}px`;renderConnections();
}
function fitFrame(frame){if(!frame)return;const box=frameDisplayBox(frame),rect=$("#canvasViewport").getBoundingClientRect(),bottom=app.presentation?110:30,width=box.w+100,height=box.h+100;app.scale=Math.min(1.35,Math.max(.01,Math.min((rect.width-30)/width,(rect.height-bottom)/height)));app.pan.x=rect.width/2-(box.x+box.w/2)*app.scale;app.pan.y=(rect.height-bottom)/2-(box.y+box.h/2)*app.scale;render();}
async function togglePresentation(){
  if(app.presentation){exitPresentation();return;}
  flushHistory();if(!chapterFrames().length)addFrameFromCurrent();
  clearTimeout(app.toastTimer);$("#toast").classList.remove("show");
  app.previousView={scale:app.scale,pan:{...app.pan},activeFrameId:app.activeFrameId};
  clearMarquee(true);clearConnection();closeSearch();app.presentation=true;app.revealCount=1;app.selectedEdgeId=null;app.drag=null;clearNodeResize();app.frameDrag=null;app.panDrag=null;closeCreationMenu();
  const chapters=chapterFrames();if(!isChapter(getFrame(app.activeFrameId)))app.activeFrameId=chapters[0]?.id||null;app.presentationIndex=Math.max(0,chapters.findIndex(frame=>frame.id===app.activeFrameId));app.activeFrameId=chapters[app.presentationIndex]?.id||null;
  document.activeElement?.blur();document.body.classList.add("present-mode");$("#presentationBar").hidden=false;
  fitFrame(getFrame(app.activeFrameId));
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();app.ownsFullscreen=true;}catch{app.ownsFullscreen=false;}}
  if(app.presentation)fitFrame(getFrame(app.activeFrameId));
}
function exitPresentation(){if(!app.presentation)return;app.presentation=false;document.querySelectorAll("video").forEach(video=>video.pause());document.body.classList.remove("present-mode");$("#presentationBar").hidden=true;if(app.previousView){app.scale=app.previousView.scale;app.pan={...app.previousView.pan};app.activeFrameId=app.previousView.activeFrameId;}if(app.ownsFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});app.ownsFullscreen=false;render();}
function stepFrame(direction){const chapters=chapterFrames();if(!chapters.length)return;const frame=getFrame(app.activeFrameId),count=orderedFrameNodes(frame).length;if(frame?.reveal&&((direction>0&&app.revealCount<count)||(direction<0&&app.revealCount>1))){app.revealCount+=direction;render();return;}const next=app.presentationIndex+direction;if(next<0||next>=chapters.length)return;app.presentationIndex=next;app.activeFrameId=chapters[next].id;app.revealCount=direction<0?Math.max(1,orderedFrameNodes(chapters[next]).length):1;fitFrame(getFrame(app.activeFrameId));}
function updatePresentationBar(){const chapters=chapterFrames(),frame=getFrame(app.activeFrameId),count=orderedFrameNodes(frame).length;$("#presentationTitle").textContent=frame?.title||"讲解模式";$("#presentationProgress").textContent=`${app.presentationIndex+1} / ${Math.max(1,chapters.length)}`;$("#presentationStepProgress").hidden=!frame?.reveal;$("#presentationStepProgress").textContent=`${Math.min(app.revealCount||1,count)} / ${count} 步`;$("#previousFrameButton").disabled=app.presentationIndex===0&&(!frame?.reveal||app.revealCount<=1);$("#nextFrameButton").disabled=app.presentationIndex>=chapters.length-1&&(!frame?.reveal||app.revealCount>=count);}
function boardSnapshot(){return JSON.stringify({nodes:app.nodes,edges:app.edges,frames:app.frames,theme:app.theme,edgeStyle:app.edgeStyle})}
function resetHistory(){clearTimeout(historyCommitTimer);clearTimeout(saveTimer);app.history=[boardSnapshot()];app.historyIndex=0;updateHistoryButtons()}
function pushHistory(){if(app.historyLock)return;const snapshot=boardSnapshot();if(app.history[app.historyIndex]===snapshot)return;app.history=app.history.slice(0,app.historyIndex+1);app.history.push(snapshot);if(app.history.length>80)app.history.shift();app.historyIndex=app.history.length-1;updateHistoryButtons()}
function flushHistory(){clearTimeout(historyCommitTimer);pushHistory();}
function commitChange(){flushHistory();clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveBoard(false),250);}
function restoreSnapshot(snapshot){finishNodeTitleEdit(false);clearMarquee();clearConnection();const state=JSON.parse(snapshot);app.nodes=state.nodes||[];app.edges=normalizeEdges(state.edges||[],state.edgeStyle);app.frames=(state.frames||[]).map(frame=>({...frame,kind:frame.kind||"chapter"}));app.theme=state.theme||"day";app.edgeStyle=state.edgeStyle||"solid";setTheme(app.theme,false);if(!getNode(app.selectedId))app.selectedId=null;app.selectedIds=[];app.selectedEdgeId=null;if(!getFrame(app.activeFrameId))app.activeFrameId=chapterFrames()[0]?.id||app.frames[0]?.id||null;app.drag=null;clearNodeResize();app.frameDrag=null;render()}
function undo(){if(app.presentation)return;flushHistory();clearTimeout(saveTimer);if(app.historyIndex<=0)return;app.historyLock=true;app.historyIndex--;restoreSnapshot(app.history[app.historyIndex]);app.historyLock=false;saveBoard(false);updateHistoryButtons();showToast("已撤销")}
function redo(){if(app.presentation)return;flushHistory();clearTimeout(saveTimer);if(app.historyIndex>=app.history.length-1)return;app.historyLock=true;app.historyIndex++;restoreSnapshot(app.history[app.historyIndex]);app.historyLock=false;saveBoard(false);updateHistoryButtons();showToast("已重做")}
function updateHistoryButtons(){const pending=boardSnapshot()!==app.history[app.historyIndex];$("#undoButton").disabled=app.historyIndex<=0&&!pending;$("#redoButton").disabled=pending||app.historyIndex>=app.history.length-1}
let historyCommitTimer;function scheduleSave(){if(app.historyLock)return;clearTimeout(saveTimer);clearTimeout(historyCommitTimer);historyCommitTimer=setTimeout(pushHistory,420);saveTimer=setTimeout(()=>saveBoard(false),500);updateHistoryButtons()}
function render(){renderFrames();renderNodes();renderConnections();renderInspector();renderFrameList();renderMeta();updateCamera();$("#boardTitle").textContent=boardLibrary.title;$("#canvasEmptyHint").hidden=app.nodes.length>0;updateHistoryButtons();if(app.presentation)updatePresentationBar()}
function saveBoard(showMessage=false){return saveBoardToLibrary(showMessage);}
function handleKeydown(event){
  if(document.querySelector("dialog[open]"))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"&&!app.presentation){event.preventDefault();openSearch();return;}
  if(event.isComposing)return;
  if(event.target.matches(".node-title-editor")&&(event.ctrlKey||event.metaKey)&&["z","y"].includes(event.key.toLowerCase()))return;
  if(app.presentation){
    if(event.key==="ArrowRight"||event.key==="PageDown"||event.code==="Space"){event.preventDefault();stepFrame(1);}
    if(event.key==="ArrowLeft"||event.key==="PageUp"){event.preventDefault();stepFrame(-1);}
    if(event.key==="Escape"){event.preventDefault();exitPresentation();}
    return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();event.shiftKey?redo():undo();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="y"){event.preventDefault();redo();return;}
  if(event.key==="Escape"){clearMarquee(true);clearConnection();closeCreationMenu();closeFileMenu();closeExportMenu(true);closeSearch();return;}
  if(event.target.matches("input,textarea,select")||event.target.isContentEditable)return;
  if(event.key==="Delete"||event.key==="Backspace"){
    if(selectedEdge()){event.preventDefault();removeSelectedEdge();}
    else if(app.editingFrame&&getFrame(app.activeFrameId)){event.preventDefault();deleteFrame();}
    else if(app.selectedId){event.preventDefault();deleteSelected();}
  }
}
function escapeHtml(value=""){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}function escapeAttr(value=""){return escapeHtml(value)}function showToast(message){const toast=$("#toast");toast.textContent=message;toast.classList.add("show");clearTimeout(app.toastTimer);app.toastTimer=setTimeout(()=>toast.classList.remove("show"),1900)}init();
