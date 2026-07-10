import React, { useState, useMemo, useCallback } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import RichTextEditor from './RichTextEditor.jsx'

const HANDLE_STYLE = { width: 9, height: 9, border: '2px solid var(--bg)', background: 'var(--text-muted)' }

function StepNode({ data }) {
  return (
    <div onClick={data.onEdit} style={{
      width: 220, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
      padding: 10, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.08)', position: 'relative',
    }}>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Stap {data.index + 1}</span>
        {data.deletable && (
          <button type="button" onClick={e => { e.stopPropagation(); data.onDelete() }}
            style={{ border: 'none', background: 'none', color: 'var(--red-text)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.subject || <em style={{ color: 'var(--text-faint)' }}>Geen onderwerp</em>}
      </div>
      {data.index > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wacht {data.wait_days_after_previous}d</div>}
      <Handle type="source" position={Position.Right} id="reply" style={{ ...HANDLE_STYLE, top: '38%', background: 'var(--accent)' }} />
      <Handle type="source" position={Position.Right} id="noreply" style={{ ...HANDLE_STYLE, top: '72%', background: 'var(--text-faint)' }} />
      <div style={{ position: 'absolute', right: -4, top: '28%', fontSize: 9, color: 'var(--accent)', transform: 'translateX(100%)' }}>reply</div>
      <div style={{ position: 'absolute', right: -4, top: '76%', fontSize: 9, color: 'var(--text-muted)', transform: 'translateX(100%)' }}>geen reply</div>
    </div>
  )
}

function EndNode() {
  return (
    <div style={{
      width: 92, height: 42, borderRadius: 21, background: 'var(--bg2)', border: '2px dashed var(--border-strong)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
    }}>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      Einde
    </div>
  )
}

const nodeTypes = { stepNode: StepNode, endNode: EndNode }

function defaultPosition(i) { return { x: 260, y: 40 + i * 180 } }

// Vrij sleepbaar canvas voor flow-stappen (i.p.v. de vaste verticale lijst).
// De "steps"-array (zelfde vorm als voorheen: subject/body/wait_days/
// on_reply/on_no_reply, nu ook canvas_x/canvas_y) blijft de enige bron van
// waarheid — nodes/edges worden er telkens uit afgeleid, niet los bijgehouden.
// Onaangepaste condities (on_reply/on_no_reply = {}) worden getoond als
// stippellijn naar hun standaardpad (zie OUTREACH_FLOW_CONDITIONS_SETUP.sql):
// geen reply → volgende stap, wel reply → Einde. Slepen vanaf een bolletje
// naar een andere stap (of naar "Einde") overschrijft dat expliciet.
export default function FlowCanvasEditor({ organizationId, steps, onChange, templates = [] }) {
  const [editingIndex, setEditingIndex] = useState(null)

  const updateStep = useCallback((i, patch) => {
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }, [steps, onChange])

  function loadTemplateIntoStep(i, templateId) {
    const t = templates.find(t => t.id === templateId)
    if (t) updateStep(i, { subject: t.subject, body: t.body })
  }

  function addStep() {
    if (steps.length >= 5) return
    const last = steps[steps.length - 1]
    onChange([...steps, {
      subject: '', body: '', wait_days_after_previous: 3, on_reply: {}, on_no_reply: {},
      canvas_x: last?.canvas_x ?? 260, canvas_y: (last?.canvas_y ?? -140) + 180,
    }])
    setEditingIndex(steps.length)
  }

  function removeStep(i) {
    if (steps.length <= 1) return
    const fix = cond => {
      if (!Number.isInteger(cond.targetIndex)) return cond
      if (cond.targetIndex === i) return {}
      return cond.targetIndex > i ? { targetIndex: cond.targetIndex - 1 } : cond
    }
    onChange(steps.filter((_, idx) => idx !== i).map(s => ({ ...s, on_reply: fix(s.on_reply || {}), on_no_reply: fix(s.on_no_reply || {}) })))
    if (editingIndex === i) setEditingIndex(null)
  }

  const endPos = useMemo(() => {
    const xs = steps.map((s, i) => s.canvas_x ?? defaultPosition(i).x)
    const ys = steps.map((s, i) => s.canvas_y ?? defaultPosition(i).y)
    return { x: Math.max(...xs) + 300, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  }, [steps])

  const nodes = useMemo(() => [
    ...steps.map((s, i) => ({
      id: String(i), type: 'stepNode', position: { x: s.canvas_x ?? defaultPosition(i).x, y: s.canvas_y ?? defaultPosition(i).y },
      data: { index: i, subject: s.subject, wait_days_after_previous: s.wait_days_after_previous, deletable: steps.length > 1, onEdit: () => setEditingIndex(i), onDelete: () => removeStep(i) },
    })),
    { id: 'end', type: 'endNode', position: endPos, draggable: false, data: {} },
  ], [steps, endPos]) // eslint-disable-line react-hooks/exhaustive-deps

  const edges = useMemo(() => {
    const list = []
    steps.forEach((s, i) => {
      const onReply = s.on_reply || {}
      const replyExplicit = !!(onReply.stop || Number.isInteger(onReply.targetIndex))
      const replyTarget = Number.isInteger(onReply.targetIndex) ? String(onReply.targetIndex) : 'end'
      list.push({
        id: `r${i}`, source: String(i), sourceHandle: 'reply', target: replyTarget, deletable: replyExplicit,
        data: { explicit: replyExplicit },
        style: { stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: replyExplicit ? undefined : '4 4', opacity: replyExplicit ? 1 : 0.4 },
      })
      const onNoReply = s.on_no_reply || {}
      const noReplyExplicit = !!(onNoReply.stop || Number.isInteger(onNoReply.targetIndex))
      const noReplyDefault = steps[i + 1] ? String(i + 1) : 'end'
      const noReplyTarget = noReplyExplicit ? (Number.isInteger(onNoReply.targetIndex) ? String(onNoReply.targetIndex) : 'end') : noReplyDefault
      list.push({
        id: `n${i}`, source: String(i), sourceHandle: 'noreply', target: noReplyTarget, deletable: noReplyExplicit,
        data: { explicit: noReplyExplicit },
        style: { stroke: 'var(--text-muted)', strokeWidth: 2, strokeDasharray: noReplyExplicit ? undefined : '4 4', opacity: noReplyExplicit ? 1 : 0.4 },
      })
    })
    return list
  }, [steps])

  const onNodesChange = useCallback(changes => {
    changes.forEach(c => { if (c.type === 'position' && c.position && c.id !== 'end') updateStep(Number(c.id), { canvas_x: c.position.x, canvas_y: c.position.y }) })
  }, [updateStep])

  const onEdgesChange = useCallback(changes => {
    changes.forEach(c => {
      if (c.type !== 'remove') return
      const edge = edges.find(e => e.id === c.id)
      if (!edge?.data?.explicit) return
      const idx = Number(edge.source)
      updateStep(idx, edge.sourceHandle === 'reply' ? { on_reply: {} } : { on_no_reply: {} })
    })
  }, [edges, updateStep])

  const onConnect = useCallback(params => {
    if (params.source === params.target || params.source === 'end') return
    const idx = Number(params.source)
    const cond = params.target === 'end' ? { stop: true } : { targetIndex: Number(params.target) }
    updateStep(idx, params.sourceHandle === 'reply' ? { on_reply: cond } : { on_no_reply: cond })
  }, [updateStep])

  return (
    <div>
      <div style={{ height: 420, border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            fitView proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="var(--border)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
          Klik een stap om 'm te bewerken. Stippellijn = nog niet aangepast standaardpad. Sleep vanaf een bolletje naar een andere stap of naar "Einde" om dat te overschrijven; klik een lijn aan en druk Delete om 'm weer op standaard te zetten.
        </p>
        {steps.length < 5 && <button type="button" className="btn btn-ghost btn-sm" onClick={addStep}>+ Stap toevoegen ({steps.length}/5)</button>}
      </div>

      {editingIndex !== null && steps[editingIndex] && (
        <div className="modal-bg open" onClick={() => setEditingIndex(null)}>
          <div className="modal" style={{ width: 580 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Stap {editingIndex + 1} bewerken</h3>
              {templates.length > 0 && (
                <select style={{ width: 'auto', height: 28, fontSize: 12 }} value="" onChange={e => e.target.value && loadTemplateIntoStep(editingIndex, e.target.value)}>
                  <option value="">Laad sjabloon in…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.sector} — {t.subject.slice(0, 30)}</option>)}
                </select>
              )}
            </div>
            {editingIndex > 0 && (
              <div className="form-group">
                <label>Wachttijd voordat deze stap verstuurd wordt (dagen)</label>
                <input type="number" min="1" style={{ width: 100 }}
                  value={steps[editingIndex].wait_days_after_previous}
                  onChange={e => updateStep(editingIndex, { wait_days_after_previous: Number(e.target.value) })} />
              </div>
            )}
            <div className="form-group">
              <label>Onderwerp</label>
              <input value={steps[editingIndex].subject} onChange={e => updateStep(editingIndex, { subject: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Tekst — {'{bedrijfsnaam}'}, {'{plaats}'}, {'{sector}'}</label>
              <RichTextEditor organizationId={organizationId} value={steps[editingIndex].body} onChange={html => updateStep(editingIndex, { body: html })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setEditingIndex(null)}>Klaar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
