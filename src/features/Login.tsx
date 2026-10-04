import { useState, type FormEvent } from 'react';
import type { AppState } from '../domain/types';
import type { Command } from '../domain/workflow';
import { Modal } from '../components/Ui';

export function Login({state,dispatch,dark,toggleTheme}:{state:AppState;dispatch:(c:Command)=>void;dark:boolean;toggleTheme:()=>void}) {
  const [id,setId]=useState('pic'); const [password,setPassword]=useState('Belajar123!');
  const [visible,setVisible]=useState(false); const [verified,setVerified]=useState(false);
  const [error,setError]=useState(''); const [otp,setOtp]=useState(''); const [challenge,setChallenge]=useState(false);
  const [flow,setFlow]=useState<'activate'|'forgot'|'register'|null>(null); const [flowUser,setFlowUser]=useState('pic');
  const [flowCode,setFlowCode]=useState(''); const [flowResult,setFlowResult]=useState(''); const [language,setLanguage]=useState('id');
  const en=language==='en';
  function login(event:FormEvent) {
    event.preventDefault();setError('');
    const user=state.users.find(u=>u.id===id.trim()||u.login===id.trim());
    if(!user || password!=='Belajar123!'){setError('Gunakan ID demo pic, drafter, atau signer dan kata sandi Belajar123!.');return;}
    if(!verified){setError('Centang verifikasi latihan terlebih dahulu.');return;}
    if(!user.activated){setError('Akun latihan belum aktif. Buka Aktivasi Akun Wajib Pajak.');return;}
    if(user.twoFactor&&otp!=='123456'){setChallenge(true);setError('2FA demo aktif. Masukkan kode latihan 123456.');return;}
    dispatch({type:'LOGIN',userId:user.id});
  }
  function completeFlow(event:FormEvent){
    event.preventDefault();setFlowResult('');
    if(flowCode!=='123456'){setFlowResult('Kode latihan tidak cocok. Gunakan 123456.');return;}
    dispatch({type:flow==='forgot'?'RESET_PASSWORD':'ACTIVATE',userId:flowUser});
    setFlowResult(flow==='forgot'?'Kata sandi demo dipulihkan: Belajar123!. Silakan masuk.':'Akses latihan aktif. Gunakan sandi demo Belajar123!.');
  }
  return <main className="login-page">
    <div className="login-top"><div className="login-wordmark"><span className="emblem" aria-hidden="true">C</span><span><b>coretax</b><small>LEARNING SIMULATOR</small></span></div><div className="login-tools"><button aria-label="Ganti tema" title="Ganti tema" onClick={toggleTheme}>{dark?'☾':'☀'}</button><label className="sr-only" htmlFor="language">Bahasa</label><select id="language" value={language} onChange={e=>setLanguage(e.target.value)}><option value="id">🇮🇩 ID</option><option value="en">EN · Login</option></select></div></div>
    <section className="login-brand"><div className="coretax-logo">CORE<span>TAX</span></div><h1>Sistem Inti Administrasi<br/> Perpajakan</h1><div className="gold-line"/><p>Kenali alurnya. Pahami pajaknya.</p></section>
    <section className="login-card" aria-label="Formulir masuk"><h2>{en?'Welcome!':'Selamat Datang!'}</h2><p className="muted">{en?'Sign in to your local learning space':'Masuk ke ruang latihan Coretax'}</p>
      <form onSubmit={login}><div className="field"><label htmlFor="login-id">{en?'User ID':'ID Pengguna'}</label><div className="input-icon"><span aria-hidden="true">♙</span><input id="login-id" value={id} onChange={e=>setId(e.target.value)} autoComplete="off" spellCheck={false} placeholder="ID demo: pic / drafter / signer" aria-describedby="demo-credentials"/></div></div>
      <div className="field"><label htmlFor="login-password">{en?'Password':'Kata Sandi'}</label><div className="input-icon"><span aria-hidden="true">♧</span><input id="login-password" type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off"/><button type="button" aria-label={visible?'Sembunyikan kata sandi':'Tampilkan kata sandi'} onClick={()=>setVisible(!visible)}>{visible?'◉':'◎'}</button></div></div>
      <div className="field"><span className="field-label">{en?'Practice verification':'Verifikasi latihan'}</span><label className="verification"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>{en?'I am ready to practice':'Saya siap berlatih'}<span className="local-pill">LOKAL</span></label></div>
      {challenge&&<div className="field"><label htmlFor="login-otp">Kode 2FA demo (123456)</label><input id="login-otp" inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6}/></div>}
      {error&&<p className="notice error" role="alert">{error}</p>}
      <button className="text-button forgot" type="button" onClick={()=>{setFlow('forgot');setFlowResult('');setFlowCode('');}}>Lupa Kata Sandi?</button>
      <button className="button primary login-submit" type="submit">{en?'Sign in':'Masuk'}<span aria-hidden="true">→</span></button></form>
      <div className="or-divider"><span>ATAU</span></div><div className="login-links"><button onClick={()=>{setFlow('register');setFlowResult('');setFlowCode('');}}><span aria-hidden="true">♙</span><span><b>Pengguna Baru?</b><small>Daftar di sini</small></span><span>→</span></button><button onClick={()=>{setFlow('activate');setFlowResult('');setFlowCode('');}}><span aria-hidden="true">♙</span><span><b>Belum Aktivasi?</b><small>Aktivasi Akun Wajib Pajak</small></span><span>→</span></button></div>

    </section>
    <div className="demo-credentials login-demo" id="demo-credentials"><b>AKUN DEMO · SNAPSHOT 4 OKTOBER 2026</b><div><button onClick={()=>setId('pic')}>pic</button><button onClick={()=>setId('drafter')}>drafter</button><button onClick={()=>setId('signer')}>signer</button><code>Belajar123!</code></div><small>Hanya identitas latihan. Jangan masukkan data asli.</small></div>
    <footer className="login-footer"><span>DESIGN · Adaptasi screenshot publik S02 dalam PDF riset</span><span>Data tersimpan di browser ini · Tanpa layanan eksternal</span></footer>
    {flow&&<Modal title={flow==='forgot'?'Pemulihan akses demo':flow==='register'?'Daftar akun latihan':'Aktivasi akun latihan'} onClose={()=>setFlow(null)}><p className="notice">DESIGN · Pilih persona sintetis. Tidak diperlukan NIK, KTP, swafoto, email, atau OTP asli.</p><form onSubmit={completeFlow}><div className="field"><label htmlFor="flow-user">Persona</label><select id="flow-user" value={flowUser} onChange={e=>setFlowUser(e.target.value)}>{state.users.map(u=><option value={u.id} key={u.id}>{u.name} · {u.role}</option>)}</select></div><p>Kontak latihan telah dicocokkan: <code>{flowUser}@simulasi.invalid</code>. Kode verifikasi lokal: <b>123456</b>.</p><div className="field"><label htmlFor="flow-code">Kode verifikasi demo</label><input id="flow-code" value={flowCode} onChange={e=>setFlowCode(e.target.value)} inputMode="numeric" maxLength={6} required/></div><button className="button primary">{flow==='forgot'?'Pulihkan kata sandi demo':'Aktifkan persona latihan'}</button>{flowResult&&<p className="notice" role="status">{flowResult}</p>}</form></Modal>}
  </main>;
}
