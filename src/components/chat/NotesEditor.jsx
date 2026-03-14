import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const NotesEditor = ({ value, onChange }) => {
  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'code-block'],
      [{ color: [] }, { background: [] }],
      ['link', 'image'],
      ['clean'],
    ],
  };

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'list',
    'bullet',
    'blockquote',
    'code-block',
    'color',
    'background',
    'link',
    'image',
  ];

  return (
    <div className="h-full flex flex-col notes-editor">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder="在此记录笔记..."
        className="h-full flex flex-col"
      />
      <style dangerouslySetInnerHTML={{ __html: `
        .notes-editor .quill {
          height: 100%;
          display: flex;
          flex-direction: column;
          font-family: "Source Sans 3", system-ui, sans-serif;
        }
        .notes-editor .ql-toolbar {
          border: 1px solid #E8E4DF !important;
          border-radius: 8px 8px 0 0;
          background: #FAFAF8;
        }
        .notes-editor .ql-container {
          flex: 1;
          border: 1px solid #E8E4DF !important;
          border-top: none !important;
          border-radius: 0 0 8px 8px;
          background: #FFFFFF;
          font-size: 16px;
          line-height: 1.75;
        }
        .notes-editor .ql-editor {
          padding: 16px;
        }
        .notes-editor .ql-editor.ql-blank::before {
          color: #6B6B6B;
          opacity: 0.6;
          font-style: normal;
        }
        .notes-editor .ql-stroke {
          stroke: #1A1A1A;
        }
        .notes-editor .ql-fill {
          fill: #1A1A1A;
        }
        .notes-editor .ql-picker-label {
          color: #1A1A1A;
        }
        .notes-editor .ql-toolbar button:hover,
        .notes-editor .ql-toolbar button:focus,
        .notes-editor .ql-toolbar button.ql-active {
          color: #B8860B;
        }
        .notes-editor .ql-toolbar button:hover .ql-stroke,
        .notes-editor .ql-toolbar button:focus .ql-stroke,
        .notes-editor .ql-toolbar button.ql-active .ql-stroke {
          stroke: #B8860B;
        }
        .notes-editor .ql-toolbar button:hover .ql-fill,
        .notes-editor .ql-toolbar button:focus .ql-fill,
        .notes-editor .ql-toolbar button.ql-active .ql-fill {
          fill: #B8860B;
        }
      ` }} />
    </div>
  );
};

export default NotesEditor;
