import React, { useState } from 'react';
import { useToast } from './Toast';
import { updateWebhookUrl, deleteContainer } from '../services/storageService';
import { Settings, X, Save, Bell, Trash2, AlertTriangle } from 'lucide-react';

interface SettingsModalProps {
    containerId: string;
    containerName: string;
    currentWebhookUrl: string;
    adminPassword?: string;
    hasAdminPassword: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onDeleted: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    containerId,
    containerName,
    currentWebhookUrl,
    adminPassword,
    hasAdminPassword,
    onClose,
    onRefresh,
    onDeleted
}) => {
    const toast = useToast();
    const [webhookUrl, setWebhookUrl] = useState(currentWebhookUrl || '');
    const [isSaving, setIsSaving] = useState(false);
    
    // Delete states
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await updateWebhookUrl(containerId, webhookUrl, adminPassword);
            toast.success('Settings saved successfully!');
            onRefresh();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletePassword.trim()) {
            toast.error('Please enter the password');
            return;
        }
        
        setIsDeleting(true);
        try {
            await deleteContainer(containerId, deletePassword);
            toast.success('Container deleted successfully');
            onDeleted();
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete container');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'fadeInScale 0.2s ease-out' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <Settings className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Container Settings</h3>
                            <p className="text-xs text-zinc-400">{containerName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSave}>
                    {/* Webhook URL */}
                    <div className="mb-6">
                        <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                            <Bell className="h-4 w-4" /> Discord Webhook URL
                        </label>
                        <input
                            type="url"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <p className="text-xs text-zinc-500 mt-2">
                            Get pinged in your Discord server whenever someone uploads a new file to this container. Leave empty to disable.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-900 hover:from-amber-500 hover:to-yellow-600 disabled:opacity-50 transition-all"
                        >
                            <Save className="h-4 w-4" />
                            {isSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </form>

                {/* Danger Zone */}
                <div className="mt-8 pt-6 border-t border-zinc-700">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <h4 className="text-sm font-semibold text-red-400">Danger Zone</h4>
                    </div>
                    
                    {!showDeleteConfirm ? (
                        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-white">Delete this container</p>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        Permanently delete this container and all its files.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10">
                            <div className="flex items-center gap-2 mb-3">
                                <Trash2 className="h-4 w-4 text-red-400" />
                                <p className="text-sm font-medium text-red-400">
                                    Confirm deletion of "{containerName}"
                                </p>
                            </div>
                            <p className="text-xs text-zinc-400 mb-3">
                                {hasAdminPassword 
                                    ? 'Enter the admin password to delete this container.' 
                                    : 'Enter the container password to confirm deletion.'}
                            </p>
                            <input
                                type="password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                placeholder={hasAdminPassword ? "Admin password" : "Container password"}
                                className="w-full px-3 py-2 border border-red-500/30 rounded-lg bg-zinc-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeletePassword('');
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={isDeleting || !deletePassword.trim()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {isDeleting ? 'Deleting...' : 'Delete Forever'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
        </div>
    );
};

export default SettingsModal;
