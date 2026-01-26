import React, { useRef, useEffect } from 'react';
import { Bold, Italic, Underline, List, AlignLeft, AlignCenter, Type, Link as LinkIcon, Image, Palette } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, className = '', placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync value to innerHTML only when not focused or empty to prevent cursor jumping
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
       // Only update if significantly different to avoid cursor reset issues
       // A simple check: if focused, don't update from props to avoid conflict
       if (document.activeElement !== editorRef.current) {
         editorRef.current.innerHTML = value;
       }
    }
  }, [value]);

  const exec = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const addLink = () => {
    const url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  };

  const addImage = () => {
    const url = prompt('Enter Image URL:');
    if (url) exec('insertImage', url);
  };

  const changeColor = () => {
    const color = prompt('Enter Hex Color (e.g. #ff0000):');
    if (color) exec('foreColor', color);
  };

  const changeFontSize = (size: string) => {
    exec('fontSize', size);
  };

  const ToolbarButton = ({ icon: Icon, action, title }: any) => (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); action(); }}
      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded transition"
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden flex flex-col bg-white ${className}`}>
      <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50 flex-wrap">
        <ToolbarButton icon={Bold} action={() => exec('bold')} title="Bold" />
        <ToolbarButton icon={Italic} action={() => exec('italic')} title="Italic" />
        <ToolbarButton icon={Underline} action={() => exec('underline')} title="Underline" />
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <select 
          onChange={(e) => changeFontSize(e.target.value)} 
          className="text-xs border-gray-200 rounded px-1 py-1 text-gray-600 focus:outline-none cursor-pointer"
        >
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="7">Huge</option>
        </select>
        <ToolbarButton icon={Palette} action={changeColor} title="Text Color" />
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolbarButton icon={AlignLeft} action={() => exec('justifyLeft')} title="Align Left" />
        <ToolbarButton icon={AlignCenter} action={() => exec('justifyCenter')} title="Align Center" />
        <ToolbarButton icon={List} action={() => exec('insertUnorderedList')} title="Bullet List" />
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolbarButton icon={LinkIcon} action={addLink} title="Insert Link" />
        <ToolbarButton icon={Image} action={addImage} title="Insert Image" />
      </div>
      
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="flex-1 p-4 outline-none prose prose-sm max-w-none overflow-y-auto min-h-[150px]"
        dangerouslySetInnerHTML={{ __html: value }}
      />
      {value === '' && placeholder && (
         <div className="absolute top-[52px] left-4 text-gray-300 pointer-events-none text-sm">{placeholder}</div>
      )}
    </div>
  );
};

export default RichTextEditor;