import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import ImageExtension from '@tiptap/extension-image'
import LinkExtension from '@tiptap/extension-link'
import { supabase } from '../../lib/supabase'
import { showToast } from '../Dashboard.jsx'

function ToolbarButton({ active, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6,
      background: active ? 'var(--accent-subtle)' : 'var(--bg2)',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </button>
  )
}

// Zelfgebouwde toolbar rond TipTap (bold/italic/lijst/link/afbeelding) —
// levert de mailtekst als HTML op via onChange. Afbeeldingen gaan naar de
// publieke 'outreach-images'-bucket (zelfde upload-patroon als company-logo's)
// zodat Gmail/andere mailclients ze over het publieke internet kunnen ophalen.
export default function RichTextEditor({ organizationId, value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      LinkExtension.configure({ openOnClick: false, autolink: true }),
      ImageExtension,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Alleen extern bijgewerkte waarden overnemen (bijv. sjabloon geladen in
  // een ander veld) — niet tijdens het eigen typen, anders springt de cursor.
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value || '', false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  async function uploadImage(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    try {
      const path = `${organizationId}/${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('outreach-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('outreach-images').getPublicUrl(path)
      editor.chain().focus().setImage({ src: data.publicUrl }).run()
    } catch (err) { showToast('Upload mislukt: ' + err.message, 'error') }
    finally { e.target.value = '' }
  }

  function setLink() {
    if (!editor) return
    const previous = editor.getAttributes('link').href
    const url = window.prompt('Link-URL:', previous || 'https://')
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  if (!editor) return null

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Vet"><b>B</b></ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursief"><i>I</i></ToolbarButton>
        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Opsomming">•≡</ToolbarButton>
        <ToolbarButton active={editor.isActive('link')} onClick={setLink} title="Link">🔗</ToolbarButton>
        <label title="Afbeelding invoegen" style={{
          width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg2)',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          🖼️
          <input type="file" accept="image/*" onChange={uploadImage} style={{ display: 'none' }} />
        </label>
      </div>
      <EditorContent editor={editor} className="rte-content" />
    </div>
  )
}
