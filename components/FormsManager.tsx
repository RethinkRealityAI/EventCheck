import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Globe, Code, ExternalLink, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Form } from '../types';
import { getForms, saveForm, deleteForm } from '../services/storageService';

const FormsManager: React.FC = () => {
  const [forms, setForms] = useState<Form[]>([]);
  const [showEmbedModal, setShowEmbedModal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setForms(getForms());
  }, []);

  const handleCreate = () => {
    const newForm: Form = {
      id: `evt_${Date.now()}`,
      title: 'New Event Registration',
      description: 'Enter event details here...',
      createdAt: new Date().toISOString(),
      status: 'draft',
      fields: [
        { id: 'f_name', type: 'text', label: 'Full Name', required: true },
        { id: 'f_email', type: 'email', label: 'Email Address', required: true }
      ]
    };
    saveForm(newForm);
    setForms(getForms());
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this form? All associated data might lose context.')) {
      deleteForm(id);
      setForms(getForms());
    }
  };

  const getEmbedCode = (formId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/form/${formId}`;
    return `<iframe src="${url}" width="100%" height="800px" frameborder="0" style="border:none; overflow:hidden;"></iframe>`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Event Forms</h2>
          <p className="text-gray-500">Create and manage registration forms for your events.</p>
        </div>
        <button 
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
        >
          <Plus className="w-5 h-5" /> Create New Form
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forms.map(form => (
          <div key={form.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                  form.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {form.status}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(form.createdAt).toLocaleDateString()}
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{form.title}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mb-4">{form.description}</p>
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-xl flex justify-between items-center">
              <div className="flex gap-2">
                <Link 
                  to={`/admin/builder/${form.id}`} 
                  className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-white rounded-lg transition"
                  title="Edit Builder"
                >
                  <Edit3 className="w-5 h-5" />
                </Link>
                <button 
                  onClick={() => setShowEmbedModal(form.id)}
                  className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-white rounded-lg transition"
                  title="Get Embed Code"
                >
                  <Code className="w-5 h-5" />
                </button>
                <Link 
                  to={`/form/${form.id}`} 
                  target="_blank"
                  className="p-2 text-gray-600 hover:text-green-600 hover:bg-white rounded-lg transition"
                  title="View Public Page"
                >
                  <ExternalLink className="w-5 h-5" />
                </Link>
              </div>
              <button 
                onClick={() => handleDelete(form.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg transition"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
        
        {forms.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 rounded-xl">
             <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
             <p className="text-gray-500">No forms created yet.</p>
             <button onClick={handleCreate} className="text-indigo-600 font-medium mt-2">Create your first form</button>
          </div>
        )}
      </div>

      {/* Embed Modal */}
      {showEmbedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-gray-900">Embed Form</h3>
              <button onClick={() => setShowEmbedModal(null)} className="text-gray-400 hover:text-gray-600">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Copy and paste this code into your website's HTML to embed the registration form.</p>
              <div className="bg-gray-900 rounded-lg p-4 relative group">
                <code className="text-green-400 text-xs break-all font-mono">
                  {getEmbedCode(showEmbedModal)}
                </code>
                <button 
                  onClick={() => copyToClipboard(getEmbedCode(showEmbedModal))}
                  className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded transition"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="p-4 bg-gray-50 text-right">
              <button 
                onClick={() => setShowEmbedModal(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormsManager;