import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import {
  Bold, Italic, List, ListOrdered, Heading1, Heading2,
  Table as TableIcon, Plus, Trash2, Grid2X2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  deleteTableRowsAndColumnsAt,
  getActiveTablePosition,
  getTableFocusContext,
  getTableGridSnapshot,
} from '../../lib/labRdTableFocus';
import { LabRdExcelPaste } from '../../lib/labRdExcelPaste';
import LabRdTableDeletePicker from './LabRdTableDeletePicker';
import './lab-rd-editor.css';

interface Props {
  contentHtml: string;
  onChange: (html: string) => void;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`lab-rd-toolbar-btn ${active ? 'lab-rd-toolbar-btn-active' : ''}`}
    >
      {children}
    </button>
  );
}

export default function LabRdRichEditor({ contentHtml, onChange }: Props) {
  const [, bumpSelection] = useState(0);
  const [deletePickerOpen, setDeletePickerOpen] = useState(false);
  const deleteTablePosRef = useRef<number | null>(null);
  const pickerMetaRef = useRef<{ initialRow: number; initialCol: number }>({ initialRow: 1, initialCol: 1 });
  const [pickerGrid, setPickerGrid] = useState<ReturnType<typeof getTableGridSnapshot>>(null);
  /** Parent updates `contentHtml` on every edit — only seed the editor once per mount (see `key` on parent). */
  const initialContentRef = useRef(contentHtml);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Start typing — use the toolbar for lists and tables…',
      }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: 'lab-rd-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      LabRdExcelPaste,
    ],
    content: initialContentRef.current,
    editorProps: {
      attributes: {
        class: 'lab-rd-editor-body prose prose-sm max-w-none focus:outline-none min-h-[420px] px-4 py-3',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const refresh = () => bumpSelection(n => n + 1);
    editor.on('selectionUpdate', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
    };
  }, [editor]);

  if (!editor) return null;

  const inTable = editor.isActive('table');
  function openDeletePicker() {
    const tablePos = getActiveTablePosition(editor);
    const ctx = getTableFocusContext(editor);
    if (tablePos == null) return;
    const grid = getTableGridSnapshot(editor, tablePos);
    if (!grid) return;
    deleteTablePosRef.current = tablePos;
    pickerMetaRef.current = {
      initialRow: ctx?.row ?? 1,
      initialCol: ctx?.col ?? 1,
    };
    setPickerGrid(grid);
    setDeletePickerOpen(true);
  }

  return (
    <div className="lab-rd-editor flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-atlas-border bg-white">
        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>
        <span className="w-px h-6 bg-neutral-200 mx-1" />
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <span className="w-px h-6 bg-neutral-200 mx-1" />
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <span className="w-px h-6 bg-neutral-200 mx-1" />
        <ToolbarButton
          title="Insert table (3×3 with header row)"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon size={16} />
        </ToolbarButton>

        <ToolbarButton
          title="Add row below current selection"
          disabled={!inTable}
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <Plus size={14} />
          <span className="text-[10px] ml-0.5">Row</span>
        </ToolbarButton>
        <ToolbarButton
          title="Add column to the right of current selection"
          disabled={!inTable}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <Plus size={14} />
          <span className="text-[10px] ml-0.5">Col</span>
        </ToolbarButton>
        <ToolbarButton
          title="Pick rows and columns to delete in a grid"
          disabled={!inTable}
          active={deletePickerOpen}
          onClick={openDeletePicker}
        >
          <Grid2X2 size={16} />
          <span className="text-[10px] ml-0.5">Delete…</span>
        </ToolbarButton>
        <ToolbarButton
          title="Delete entire table"
          disabled={!inTable}
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <Trash2 size={14} />
        </ToolbarButton>
      </div>
      <div className="flex-1 overflow-y-auto bg-white min-h-[480px]">
        <EditorContent editor={editor} />
      </div>

      {deletePickerOpen && pickerGrid && (
        <LabRdTableDeletePicker
          grid={pickerGrid}
          initialRow={pickerMetaRef.current.initialRow}
          initialCol={pickerMetaRef.current.initialCol}
          onClose={() => {
            setDeletePickerOpen(false);
            setPickerGrid(null);
          }}
          onConfirm={(rows0, cols0) => {
            const tablePos = deleteTablePosRef.current;
            if (tablePos == null) return false;
            const ok = deleteTableRowsAndColumnsAt(editor, rows0, cols0, tablePos);
            if (ok) {
              onChange(editor.getHTML());
              deleteTablePosRef.current = null;
              setPickerGrid(null);
              setDeletePickerOpen(false);
              bumpSelection(n => n + 1);
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
