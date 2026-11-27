import {useState,type DragEvent} from 'react';
import {ArrowDownToLine,FileSpreadsheet,Upload} from 'lucide-react';
import {publicFields,type State} from '../lib/model';
import {CheckField,downloadText,Empty,Field,formatDate,type Run} from './AdminFields';
import {MediaReport,type MediaResult} from './AdminMedia';
import {fieldLabel} from './PlaceCard';

export type ImportKind='businesses'|'urls'|'zip';
type ImportReport={added:number;updated:number;unchanged:number;rejected:number;duplicates:number;errors:string[];processed:number;total:number;columns:string[];jobId?:string};
type RestoreReport={ok:boolean;businesses:number;media:number;candidates:number;destinations:number;errors:string[]};
const originalPrivate=[
  'logo_url','photo_url','image_permissions','source_url','source_id','license','verification_date','confidence',
  'website_available','mobile_responsive','has_online_booking','has_online_ordering','has_digital_payments','social_media_presence','merqato_opportunity',
];
const urlFields=['business_id','original_source_url','image_url','reuse_permission_status','license','attribution','filename'];

function BusinessImportReport({report,preview}:{report:ImportReport;preview:boolean}) {
  return <div className="studio-report" role="status">
    <h3>{preview?'Dry run results':'Import results'}</h3>
    <dl className="studio-report-counts">
      {([['Processed',report.processed],['Added',report.added],['Updated',report.updated],['Unchanged',report.unchanged],['Duplicates',report.duplicates],['Rejected',report.rejected]] as const).filter(([,value])=>value!=null).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}
    </dl>
    {!!report.errors?.length&&<>
      <ul>{report.errors.slice(0,8).map((error,index)=><li key={index}>{error}</li>)}</ul>
      <button type="button" onClick={()=>downloadText('import-errors.txt',report.errors.join('\n'))}>Download full error report</button>
    </>}
    {!!report.jobId&&<p>Import ID <code>{report.jobId}</code></p>}
  </div>;
}

export function AdminImport({initialKind,run,busy,history}:{initialKind:ImportKind;run:Run;busy:boolean;history:State['imports']}) {
  const [kind,setKind]=useState<ImportKind>(initialKind);
  const [file,setFile]=useState<File|null>(null);
  const [overwrite,setOverwrite]=useState(false);
  const [columns,setColumns]=useState<string[]>([]);
  const [mapping,setMapping]=useState<Record<string,string>>({});
  const [report,setReport]=useState<ImportReport|null>(null);
  const [mediaReport,setMediaReport]=useState<MediaResult|null>(null);
  const [preview,setPreview]=useState(true);
  const [progress,setProgress]=useState('');
  function clearReport() {
    setReport(null);
    setMediaReport(null);
  }
  function selectFile(value:File|null) {
    setFile(value);
    setColumns([]);
    setMapping({});
    clearReport();
  }
  function drop(event:DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!busy&&event.dataTransfer.files.length) selectFile(event.dataTransfer.files[0]);
  }
  async function upload(dryRun:boolean) {
    if (!file) return;
    const payload=new FormData();
    payload.set('file',file);
    clearReport();
    if (kind==='zip') {
      setProgress('Validating the ZIP and saving approved files…');
      setMediaReport(await run<MediaResult>('/api/media',{method:'POST',body:payload}));
    } else {
      payload.set('kind',kind);
      payload.set('preview',String(dryRun));
      payload.set('overwrite',String(overwrite));
      payload.set('mapping',JSON.stringify(mapping));
      setProgress(dryRun?'Checking rows and duplicate IDs…':'Applying the validated import…');
      const result=await run<ImportReport>('/api/import',{method:'POST',body:payload},undefined,!dryRun);
      if (result) {
        setColumns(result.columns||[]);
        setPreview(dryRun);
        setReport(result);
      }
    }
    setProgress('');
  }

  return <div className="studio-stack">
    <section className="studio-panel studio-stack">
      <Field label="Import type">
        <select value={kind} onChange={event=>{setKind(event.target.value as ImportKind);selectFile(null);}} disabled={busy}>
          <option value="businesses">Business records</option>
          <option value="urls">Image URL candidates</option>
          <option value="zip">Approved media ZIP</option>
        </select>
      </Field>
      <div className="studio-dropzone" onDragOver={event=>event.preventDefault()} onDrop={drop}>
        <FileSpreadsheet size={26}/>
        <strong>{file?file.name:'Choose a file or drag it here'}</strong>
        <span>{kind==='zip'?'ZIP with an image-manifest.csv file':'XLSX, CSV, JSON or GeoJSON'}</span>
        <input key={kind} type="file" aria-label="Import file" accept={kind==='zip'?'.zip':'.xlsx,.csv,.json,.geojson'} disabled={busy} onChange={event=>selectFile(event.target.files?.[0]||null)}/>
      </div>
      {kind==='businesses'&&<div className="studio-import-permission"><CheckField label="Overwrite existing source fields" value={overwrite} set={value=>{if(!busy){setOverwrite(value);clearReport();}}}/><p>By default, existing edits are preserved and matching IDs only receive missing values.</p></div>}
      {kind==='urls'&&<p>Use a business ID, image source URL, reuse permission status, license and attribution. Review candidates in the Media library before fetching them.</p>}
      {kind==='zip'&&<p>Include business_id, filename, relative_file_path, image_type, original_source_url, license, reuse_permission_status and attribution in the manifest.</p>}
      {kind!=='zip'&&columns.length>0&&<details className="studio-details" open>
        <summary>Column mapping</summary>
        <p>Keep the detected field names or map source columns to directory fields, then run the dry run again.</p>
        <div className="studio-map-columns">{columns.map(column=><Field key={column} label={column}>
          <select value={mapping[column]||''} disabled={busy} onChange={event=>{
            const value=event.target.value;
            setMapping(previous=>{
              const next={...previous};
              if (value) next[column]=value;
              else delete next[column];
              return next;
            });
            clearReport();
          }}>
            <option value="">Use detected field</option>
            {(kind==='urls'?urlFields:[...publicFields,...originalPrivate]).map(key=><option key={key} value={key}>{fieldLabel(key)}</option>)}
          </select>
        </Field>)}</div>
      </details>}
      <div className="studio-form-actions">
        {kind==='zip'?<button type="button" className="primary" disabled={busy||!file} onClick={()=>upload(false)}><Upload size={17}/> Import approved media</button>:<>
          <button type="button" disabled={busy||!file} onClick={()=>upload(true)}>Run dry run</button>
          <button type="button" className="primary" disabled={busy||!file||!report||!preview} onClick={()=>upload(false)}><Upload size={17}/> Apply import</button>
        </>}
      </div>
      {progress&&<p role="status">{progress}</p>}
      {report&&<BusinessImportReport report={report} preview={preview}/>}
      {mediaReport&&<MediaReport result={mediaReport}/>}
    </section>
    <section className="studio-panel">
      <h2>Import history</h2>
      {history.length?<div className="studio-table"><table><thead><tr><th>File</th><th>Added</th><th>Updated</th><th>Rejected</th><th>Time</th></tr></thead><tbody>
        {history.slice(-25).reverse().map((job,index)=><tr key={job.at+index}><td>{job.name}</td><td>{job.added}</td><td>{job.updated}</td><td>{job.rejected}</td><td>{formatDate(job.at)}</td></tr>)}
      </tbody></table></div>:<Empty>No import jobs have been applied yet.</Empty>}
    </section>
  </div>;
}

export function AdminExports({run,busy}:{run:Run;busy:boolean}) {
  const [file,setFile]=useState<File|null>(null);
  const [report,setReport]=useState<RestoreReport|null>(null);
  const [validated,setValidated]=useState(false);
  async function restore(preview:boolean) {
    if (!file) return;
    if (!preview&&!window.confirm('Replace the current local directory with this snapshot?')) return;
    const payload=new FormData();
    payload.set('file',file);
    payload.set('preview',String(preview));
    if (!preview) payload.set('confirm','restore');
    const result=await run<RestoreReport>('/api/restore',{method:'POST',body:payload},preview?undefined:'Local snapshot restored.',!preview);
    setReport(result);
    setValidated(preview&&result?.ok===true);
  }
  return <div className="studio-stack">
    <section className="studio-panel studio-stack">
      <h2>Download directory data</h2>
      <div className="studio-export-grid">
        {[
          ['xlsx','Excel workbook','Business records and media metadata'],
          ['csv','CSV spreadsheet','Business records with their source fields'],
          ['geojson','GeoJSON','Business records with map coordinates'],
          ['json','JSON snapshot','Local data, settings and media references'],
        ].map(([format,label,hint])=><a key={format} href={`/api/export?format=${format}`} className="studio-export-link" download><ArrowDownToLine size={21}/><strong>{label}</strong><span>{hint}</span></a>)}
      </div>
    </section>
    <section className="studio-panel studio-stack">
      <h2>Restore a local snapshot</h2>
      <p>Keep the corresponding local media files with your snapshot. JSON stores media references and metadata.</p>
      <Field label="JSON snapshot"><input type="file" accept=".json" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]||null);setReport(null);setValidated(false);}}/></Field>
      <div className="studio-form-actions"><button type="button" disabled={busy||!file} onClick={()=>restore(true)}>Validate snapshot</button><button type="button" className="primary" disabled={busy||!validated} onClick={()=>restore(false)}>Restore snapshot</button></div>
      {report&&<div className="studio-report" role="status"><h3>{!report.ok?'Snapshot needs attention':validated?'Snapshot ready to restore':'Snapshot restored'}</h3><p>{report.businesses} businesses · {report.media} media references · {report.candidates} candidates · {report.destinations} destinations</p>{!!report.errors?.length&&<><ul>{report.errors.slice(0,8).map((error,index)=><li key={index}>{error}</li>)}</ul><button type="button" onClick={()=>downloadText('snapshot-validation.txt',report.errors.join('\n'))}>Download validation report</button></>}</div>}
    </section>
  </div>;
}
