import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Pencil, Eraser, RotateCcw, Play, Users, Copy, Check, ArrowRight, Home, Send, Sparkles, BookOpen, Paintbrush, WifiOff, Link2, ChevronLeft, ChevronRight } from 'lucide-react';
import './style.css';

const ENDPOINT = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(ENDPOINT, { autoConnect: false, reconnection: true });
const PALETTE = ['#17152d','#fff','#ee657b','#ffb158','#f8d965','#5bcba4','#4d9ee9','#9575eb','#d665bb'];
const samples = ['Um dinossauro trabalhando em uma pizzaria', 'Uma capivara astronauta na Lua', 'Um robô tentando aprender a dançar', 'Uma batata dirigindo um ônibus', 'Um gato dando aula de matemática', 'Um alienígena com medo de borboletas'];

function Canvas({ onSubmit, busy }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(5);
  const [erase, setErase] = useState(false);
  const [history, setHistory] = useState([]);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height);
  }, []);
  const record = () => setHistory(v => [...v.slice(-12), canvas.current.toDataURL('image/png')]);
  const point = e => {
    const rect = canvas.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * canvas.current.width / rect.width, y: (e.clientY - rect.top) * canvas.current.height / rect.height };
  };
  const down = e => {
    if (busy) return;
    e.preventDefault(); record(); drawing.current = true;
    canvas.current.setPointerCapture(e.pointerId);
    last.current = point(e);
    const ctx = canvas.current.getContext('2d');
    ctx.fillStyle = erase ? '#ffffff' : color;
    ctx.beginPath(); ctx.arc(last.current.x, last.current.y, size / 2, 0, Math.PI*2); ctx.fill();
  };
  const move = e => {
    if (!drawing.current) return;
    e.preventDefault();
    const next = point(e);
    const ctx = canvas.current.getContext('2d');
    ctx.strokeStyle = erase ? '#fff' : color;
    ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.current.x,last.current.y); ctx.lineTo(next.x,next.y); ctx.stroke();
    last.current = next;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const undo = () => {
    if (!history.length) return;
    const image = new Image(); const data = history.at(-1);
    image.onload = () => canvas.current.getContext('2d').drawImage(image,0,0);
    image.src = data; setHistory(v => v.slice(0,-1));
  };
  const clear = () => { record(); const c = canvas.current; c.getContext('2d').fillStyle = '#fff'; c.getContext('2d').fillRect(0,0,c.width,c.height); };
  return <div className="draw-wrap">
    <div className="toolbar">
      <div className="colors">{PALETTE.map(c => <button key={c} aria-label={`Cor ${c}`} className={'color '+(color===c&&!erase?'selected':'')} style={{background:c}} onClick={()=>{setColor(c);setErase(false);}} />)}</div>
      <div className="tool-actions">
        <button className={'tool '+(!erase?'active':'')} onClick={()=>setErase(false)} title="Pincel"><Pencil size={19}/></button>
        <button className={'tool '+(erase?'active':'')} onClick={()=>setErase(true)} title="Borracha"><Eraser size={19}/></button>
        <select aria-label="Espessura do traço" value={size} onChange={e=>setSize(Number(e.target.value))}><option value="3">Fino</option><option value="5">Médio</option><option value="10">Normal</option><option value="20">Gigante</option></select>
        <button className="tool" title="Desfazer" onClick={undo} disabled={!history.length}><RotateCcw size={19}/></button>
        <button className="tool" title="Limpar" onClick={clear}>Limpar</button>
      </div>
    </div>
    <canvas ref={canvas} width={840} height={520} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="drawing" aria-label="Área de desenho" />
    <button disabled={busy} className="primary send" onClick={()=>onSubmit(canvas.current.toDataURL('image/jpeg',0.7))}><Send size={19}/> Enviar desenho</button>
  </div>;
}

function App() {
  const [connected,setConnected] = useState(false);
  const [room,setRoom] = useState(null);
  const [me,setMe] = useState(null);
  const [name,setName] = useState(localStorage.getItem('rabiscos:name') || '');
  const [code,setCode] = useState(new URLSearchParams(location.search).get('sala') || '');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [turn,setTurn] = useState(null);
  const [answer,setAnswer] = useState('');
  const [albums,setAlbums] = useState([]);
  const [albumIndex,setAlbumIndex] = useState(0);
  const [copied,setCopied] = useState(false);
  const [clock,setClock] = useState(Date.now());
  const meRef = useRef(null);
  const roomRef = useRef(null);
  const turnRef = useRef(null);
  const ack = (event, data) => new Promise(resolve => socket.timeout(6000).emit(event,data,(err,res)=>resolve(err ? {ok:false,error:'Servidor não respondeu. Tente novamente.'} : res)));
  useEffect(() => {
    socket.connect();
    const handleConnect = async () => {
      setConnected(true);
      const saved = JSON.parse(localStorage.getItem('rabiscos:session') || 'null');
      if (saved && !roomRef.current) {
        const res = await ack('room:join',saved);
        if (res?.ok) { meRef.current = res.playerId; setMe(res.playerId); setCode(res.code); }
        else localStorage.removeItem('rabiscos:session');
      } else if (saved && roomRef.current) {
        const res = await ack('room:join',saved);
        if (res?.ok) { meRef.current=res.playerId; setMe(res.playerId); }
      }
    };
    const handleDisconnect = () => setConnected(false);
    const handleState = state => { roomRef.current=state; setRoom(state); };
    const handleTurn = data => { turnRef.current=data; setTurn(data); setAnswer(''); setBusy(false); };
    const handleReveal = data => { setAlbums(data); setAlbumIndex(0); setBusy(false); };
    socket.on('connect',handleConnect); socket.on('disconnect',handleDisconnect);
    socket.on('room:state',handleState);socket.on('game:turn',handleTurn);socket.on('game:reveal',handleReveal);
    if(socket.connected) handleConnect();
    const timer = setInterval(()=>setClock(Date.now()),1000);
    return ()=>{ clearInterval(timer); socket.off('connect',handleConnect);socket.off('disconnect',handleDisconnect);socket.off('room:state',handleState);socket.off('game:turn',handleTurn);socket.off('game:reveal',handleReveal);socket.disconnect(); };
  }, []);
  const join = async create => {
    setError('');
    if (!name.trim()) return setError('Escreva seu apelido.');
    if (!create && code.replace(/\s/g,'').length!==6) return setError('Digite um código de 6 caracteres.');
    setBusy(true);
    const res = await ack(create?'room:create':'room:join',{name:name.trim(),code:code.trim().toUpperCase()});
    setBusy(false);
    if (!res?.ok) return setError(res?.error || 'Não foi possível entrar.');
    localStorage.setItem('rabiscos:name',name.trim());
    localStorage.setItem('rabiscos:session',JSON.stringify({code:res.code,name:name.trim(),token:res.token}));
    meRef.current=res.playerId;setMe(res.playerId);setCode(res.code);
    history.replaceState(null,'',`${location.pathname}?sala=${res.code}`);
  };
  const leave = async () => {
    await ack('room:leave',{});
    localStorage.removeItem('rabiscos:session');
    history.replaceState(null,'',location.pathname);
    roomRef.current=null; setRoom(null);setMe(null);setTurn(null);setAlbums([]);setBusy(false);setError('');
  };
  const start = async () => { setError(''); const res=await ack('game:start',{}); if(!res?.ok)setError(res?.error); };
  const submit = async value => {
    setError('');setBusy(true);
    const submittingStep = turnRef.current?.step;
    const res=await ack('game:submit',{value});
    if(!res?.ok){setBusy(false);setError(res?.error||'Falha no envio.');}
    else setTurn(t=>t?.step===submittingStep?{...t,submitted:true}:t);
  };
  const copy = async () => { await navigator.clipboard.writeText(`${location.origin}/?sala=${room.code}`);setCopied(true);setTimeout(()=>setCopied(false),1800); };
  const seconds = Math.max(0,Math.ceil(((room?.deadline||clock)-clock)/1000));
  return <div className="app">
    <header><div className="brand" onClick={()=>!room&&window.scrollTo(0,0)}><div className="brand-icon"><Pencil size={23}/></div><span>Telefone<span className="accent"> de Rabiscos</span></span></div><div className="header-right"><span className={'status '+(connected?'online':'offline')}>{connected?'● Conectado':'● Desconectado'}</span>{room&&<button className="subtle" onClick={leave}><Home size={16}/> Sair da sala</button>}</div></header>
    <main>
    {!room&&<div className="landing"><div className="hero"><div className="eyebrow"><Sparkles size={15}/> JOGO MULTIPLAYER GRATUITO</div><h1>Uma frase. Um desenho.<br/><span>Uma confusão hilária.</span></h1><p>O clássico telefone sem fio, só que com desenhos. Convide a turma, solte a criatividade e veja como a história termina!</p></div>
      <div className="entry-grid"><section className="panel main-panel"><h2>Vamos jogar?</h2><p className="muted">Crie sua própria sala ou entre na sala de alguém.</p><label>SEU APELIDO</label><input maxLength={22} placeholder="Como vamos te chamar?" value={name} onChange={e=>setName(e.target.value)}/><button disabled={!connected||busy} className="primary" onClick={()=>join(true)}><Play size={19} fill="currentColor"/> Criar uma sala <ArrowRight size={18}/></button><div className="separator"><span>ou entre em uma sala</span></div><label>CÓDIGO DA SALA</label><div className="join-row"><input maxLength={6} placeholder="EX: A1B2C3" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button disabled={!connected||busy} onClick={()=>join(false)} className="secondary">Entrar <ArrowRight size={17}/></button></div>{error&&<p className="error">{error}</p>}</section>
      <aside className="how"><div className="how-card"><div className="how-icon orange"><BookOpen/></div><div><h3>1. Escreva</h3><p>Todo mundo começa com uma frase criativa.</p></div></div><div className="how-card"><div className="how-icon pink"><Paintbrush/></div><div><h3>2. Desenhe</h3><p>A próxima pessoa desenha o que leu.</p></div></div><div className="how-card"><div className="how-icon purple"><Users/></div><div><h3>3. Adivinhe</h3><p>Outra pessoa tenta descrever o desenho. Repita e dê risada!</p></div></div></aside></div><p className="footer">De 2 a 10 jogadores • Funciona no celular e no computador • Sem cadastro</p></div>}
    {room?.phase==='lobby'&&<div className="stage"><div className="stage-title"><div className="eyebrow"><Users size={15}/> SALA DE ESPERA</div><h1>Reúna a galera!</h1><p>Compartilhe o link ou código da sala.</p></div><div className="panel lobby"><div className="room-heading"><div><small>CÓDIGO DA SALA</small><div className="room-code">{room.code}</div></div><button className="secondary" onClick={copy}>{copied?<Check size={18}/>:<Copy size={18}/>} {copied?'Copiado!':'Copiar convite'}</button></div><div className="divider"/><div className="players-title"><h3>Jogadores <span className="pill">{room.players.length}/10</span></h3><span className="muted">Mínimo 2</span></div><div className="player-grid">{room.players.map((p,i)=><div key={p.id} className="player"><span className={'avatar avatar-'+(i%5)}>{p.name.charAt(0).toUpperCase()}</span><span>{p.name} {p.id===me&&<small>(você)</small>}</span>{p.id===room.hostId&&<span className="host">Anfitrião</span>}</div>)}</div>{error&&<p className="error">{error}</p>}{me===room.hostId?<button className="primary" onClick={start} disabled={room.players.length<2}><Play size={19} fill="currentColor"/> Começar a partida <ArrowRight size={19}/></button>:<div className="waiting"><span className="spinner"/> Esperando o anfitrião iniciar a partida...</div>}</div><p className="hint">Dica: cada jogador deve usar seu próprio celular ou computador.</p></div>}
    {room?.phase==='playing'&&<div className="stage game"><div className="game-top"><span className="round-pill">RODADA {room.step+1} DE {room.totalSteps}</span><div className="progress"><div style={{width:`${(room.step+1)/room.totalSteps*100}%`}}/></div><span className={'timer '+(seconds<20?'urgent':'')}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></div>{turn?.step===room.step ? (turn.submitted?<div className="panel done"><div className="giant">✓</div><h2>Resposta enviada!</h2><p>Agora é só esperar o restante da turma.</p><div className="waiting"><span className="spinner"/>{room.submittedCount} de {room.players.length} enviaram</div></div>:<div className="play-area"><div className="stage-title"><div className="eyebrow">{turn.type==='drawing'?'HORA DE DESENHAR':'HORA DE ESCREVER'}</div><h1>{turn.type==='drawing'?'Desenhe essa frase!':turn.previous?.type==='drawing'?'O que é esse desenho?':'Invente uma frase!'}</h1><p>{turn.type==='drawing'?'Não use palavras no desenho. Solte a criatividade!':turn.previous?.type==='drawing'?'Descreva o que você acha que está acontecendo.':'Escreva uma frase divertida para começar a história.'}</p></div>
    {turn.previous?.type==='text'&&<div className="prompt"><small>VOCÊ RECEBEU:</small><div>{turn.previous.value}</div></div>}
    {turn.previous?.type==='drawing'&&<div className="received"><img src={turn.previous.value} alt="Desenho recebido da rodada anterior"/></div>}
    {turn.type==='drawing'?<Canvas key={room.step} onSubmit={submit} busy={busy}/>:<div className="panel text-panel"><textarea maxLength={160} rows={3} placeholder="Era uma vez uma capivara que..." value={answer} onChange={e=>setAnswer(e.target.value)}/><div className="text-footer"><span className="muted">{answer.length}/160 caracteres</span><button className="primary" onClick={()=>submit(answer)} disabled={!answer.trim()||busy}><Send size={18}/> Enviar frase</button></div>{room.step===0&&<button className="suggestion" onClick={()=>setAnswer(samples[Math.floor(Math.random()*samples.length)])}><Sparkles size={15}/> Me dê uma ideia</button>}</div>}
    {error&&<p className="error">{error}</p>}</div>):<div className="panel done"><span className="spinner"/><h2>Preparando sua rodada...</h2></div>}</div>}
    {room?.phase==='reveal'&&<div className="stage reveal"><div className="stage-title"><div className="eyebrow"><Sparkles size={15}/> A GRANDE REVELAÇÃO</div><h1>Olha no que deu! 😂</h1><p>Veja como cada frase se transformou pelo caminho.</p></div><div className="album-controls"><button onClick={()=>setAlbumIndex(i=>Math.max(0,i-1))} disabled={albumIndex===0} className="secondary"><ChevronLeft size={17}/> Anterior</button><span>História {albumIndex+1} de {albums.length}</span><button onClick={()=>setAlbumIndex(i=>Math.min(albums.length-1,i+1))} disabled={albumIndex===albums.length-1} className="secondary">Próxima <ChevronRight size={17}/></button></div>{albums[albumIndex]&&<div className="album"><h2>O caderno de {albums[albumIndex].creatorName}</h2>{albums[albumIndex].entries.map((entry,i)=><div className="album-entry" key={i}><div className="entry-number">{i+1}</div><div className="entry-body"><div className="entry-author">{entry.name} <span>• {entry.type==='drawing'?'Desenhou':'Escreveu'}</span></div>{entry.type==='drawing' ? entry.value?<img src={entry.value} alt={`Desenho de ${entry.name}`}/>:<p className="missing">(sem desenho)</p>:<p className="entry-text">{entry.value}</p>}</div></div>)}</div>}<div className="reveal-bottom">{me===room.hostId?<button onClick={start} className="primary"><RotateCcw size={18}/> Jogar novamente</button>:<p className="muted">Esperando o anfitrião começar outra partida...</p>}{error&&<p className="error">{error}</p>}</div></div>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
