import { useEffect, useRef, type ReactNode } from 'react';
export const rupiah = (value: string | number) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Number(value));
export function Badge({children,kind='neutral'}:{children:ReactNode;kind?:string}) { return <span className={`badge ${kind}`}>{children}</span>; }
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);
  return <dialog ref={ref} className="modal" onCancel={onClose}><header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Tutup dialog" onClick={onClose}>×</button></header>{children}</dialog>;
}
export function Empty({text='Belum ada dokumen untuk wajib pajak ini.'}:{text?:string}) { return <div className="empty"><span aria-hidden="true">▤</span><p>{text}</p></div>; }
