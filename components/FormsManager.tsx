import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Globe, Code, ExternalLink, Copy, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Form } from '../types';
import { getForms, saveForm, deleteForm } from '../services/storageService';
import { useNotifications } from './NotificationSystem';
import TemplatePickerModal from './FormBuilder/TemplatePickerModal';
import { type FormTemplate } from '../config/formTemplates';

const FormsManager: React.FC = () => {
  const [forms, setForms] = useState<Form[]>([]);
  const [showEmbedModal, setShowEmbedModal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { showNotification } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const data = await getForms();
      setForms(data);
    };
    fetch();
  }, []);

  const handlePick = async (t: FormTemplate) => {
    const partial = t.build();
    const newForm: Form = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'draft',
    } as Form;
    await saveForm(newForm);
    setPickerOpen(false);
    navigate(`/admin/builder/${newForm.id}`);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this form? All associated data might lose context.')) {
      await deleteForm(id);
      const updatedForms = await getForms();
      setForms(updatedForms);
      showNotification('Form deleted successfully', 'info');
    }
  };

  const handleDuplicate = async (form: Form) => {
    const duplicatedForm: Form = {
      ...form,
      id: crypto.randomUUID(),
      title: `${form.title} (Copy)`,
      createdAt: new Date().toISOString(),
      status: 'draft',
      fields: JSON.parse(JSON.stringify(form.fields))
    };
    await saveForm(duplicatedForm);
    const updatedForms = await getForms();
    setForms(updatedForms);
    showNotification('Form duplicated successfully', 'success');
  };

  const getEmbedCode = (formId: string) => {
    const url = `${window.location.origin}/#/form/${formId}`;
    return `<iframe src="${url}" width="100%" height="800px" frameborder="0" style="border:none; overflow:hidden;"></iframe>`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showNotification('Embed code copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8 bg-gradient-to-r from-emerald-600 to-teal-700 p-8 rounded-3xl shadow-2xl shadow-emerald-600/20 text-white relative overflow-hidden border border-emerald-500/30">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="absolute -right-10 -top-20 opacity-20 transform rotate-12 scale-150 pointer-events-none">
          <Globe strokeWidth={1.5} className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 border border-white/20 shadow-sm text-emerald-50">
            FORM STUDIO
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-2 drop-shadow-md tracking-tight">Event Forms</h2>
          <p className="text-emerald-100 font-medium tracking-wide text-lg max-w-lg">Create and manage registration forms for your events.</p>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition font-bold shadow-xl shadow-black/10 hover:shadow-2xl hover:scale-105 transform duration-300"
          >
            <Plus className="w-5 h-5" /> Create Form
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forms.map(form => (
          <div key={form.id} className="bg-white/60 backdrop-blur-3xl rounded-3xl border border-white/60 shadow-xl shadow-indigo-500/5 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 transform hover:-translate-y-1 flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none">
               <Globe className="w-24 h-24 transform right-[-20px] top-[-20px]" />
            </div>
            <div className="p-6 flex-1 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wide shadow-sm border ${form.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200/50' : 'bg-yellow-100 text-yellow-700 border-yellow-200/50'
                  }`}>
                  {form.status}
                </div>
                <div className="text-xs font-bold text-slate-400 bg-white/50 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/40">
                  {new Date(form.createdAt).toLocaleDateString()}
                </div>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">{form.title}</h3>
              <p className="text-sm font-medium text-slate-500 line-clamp-2 mb-4">{form.description}</p>
            </div>

            <div className="p-4 bg-white/40 backdrop-blur-md border-t border-white/60 flex justify-between items-center relative z-10">
              <div className="flex gap-2">
                <Link
                  to={`/admin/builder/${form.id}`}
                  className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl transition shadow-sm border border-transparent hover:border-indigo-100"
                  title="Edit Builder"
                >
                  <Edit3 className="w-5 h-5" />
                </Link>
                <button
                  onClick={() => setShowEmbedModal(form.id)}
                  className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl transition shadow-sm border border-transparent hover:border-indigo-100"
                  title="Get Embed Code"
                >
                  <Code className="w-5 h-5" />
                </button>
                <Link
                  to={`/form/${form.id}`}
                  target="_blank"
                  className="p-2.5 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-xl transition shadow-sm border border-transparent hover:border-emerald-100"
                  title="View Public Page"
                >
                  <ExternalLink className="w-5 h-5" />
                </Link>
                <button
                  onClick={() => handleDuplicate(form)}
                  className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded-xl transition shadow-sm border border-transparent hover:border-blue-100"
                  title="Duplicate Form"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => handleDelete(form.id)}
                className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition border border-transparent hover:border-red-100"
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
            <button onClick={() => setPickerOpen(true)} className="text-indigo-600 font-medium mt-2">Create your first form</button>
          </div>
        )}
      </div>

      {pickerOpen && (
        <TemplatePickerModal onPick={handlePick} onClose={() => setPickerOpen(false)} />
      )}

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