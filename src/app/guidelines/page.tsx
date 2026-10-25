'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { BrandGuideline, ApprovedFact, AuthorizedAsset, AssetType, RuleSeverity } from '@/lib/types';
import { formatRuleTypeLabel, getSeverityBadge } from '@/lib/utils';
import {
  BookCheck,
  Plus,
  CheckCircle2,
  RefreshCw,
  Database,
  Edit2,
  Power,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Check,
  Copy,
  Layers,
  Palette,
  Upload,
  Trash2,
} from 'lucide-react';

export default function GuidelinesPage() {
  const [activeTab, setActiveTab] = useState<'guidelines' | 'facts' | 'assets' | 'setup' | 'database'>('guidelines');
  const [guidelines, setGuidelines] = useState<BrandGuideline[]>([]);
  const [facts, setFacts] = useState<ApprovedFact[]>([]);
  const [assets, setAssets] = useState<AuthorizedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalType, setModalType] = useState<'guideline' | 'fact' | 'asset'>('guideline');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Guideline Form
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleType, setRuleType] = useState('voice_and_tone');
  const [ruleSeverity, setRuleSeverity] = useState<RuleSeverity>('medium');
  const [ruleDescription, setRuleDescription] = useState('');
  const [allowedExamples, setAllowedExamples] = useState('');
  const [forbiddenExamples, setForbiddenExamples] = useState('');
  const [ruleKeywords, setRuleKeywords] = useState('');

  // Fact Form
  const [factText, setFactText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');

  // Asset Form
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('logo');
  const [assetFileUrl, setAssetFileUrl] = useState('');
  const [assetHexColors, setAssetHexColors] = useState('');
  const [assetNotes, setAssetNotes] = useState('');
  const [isPrimaryAsset, setIsPrimaryAsset] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement>(null);

  // Setup Workflow Form
  const [setupBrandName, setSetupBrandName] = useState('');
  const [isInitializingSetup, setIsInitializingSetup] = useState(false);
  const [setupSuccessMessage, setSetupSuccessMessage] = useState<string | null>(null);
  const [setupErrorMessage, setSetupErrorMessage] = useState<string | null>(null);

  // Schema Copy state
  const [schemaCopied, setSchemaCopied] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [guidelinesRes, factsRes, assetsRes] = await Promise.all([
        fetch('/api/guidelines'),
        fetch('/api/facts'),
        fetch('/api/assets'),
      ]);

      if (guidelinesRes.ok) {
        const data = await guidelinesRes.json();
        setGuidelines(data.guidelines || []);
      }
      if (factsRes.ok) {
        const data = await factsRes.json();
        setFacts(data.facts || []);
      }
      if (assetsRes.ok) {
        const data = await assetsRes.json();
        setAssets(data.assets || []);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [guidelinesRes, factsRes, assetsRes] = await Promise.all([
          fetch('/api/guidelines'),
          fetch('/api/facts'),
          fetch('/api/assets'),
        ]);

        if (isMounted) {
          if (guidelinesRes.ok) {
            const data = await guidelinesRes.json();
            setGuidelines(data.guidelines || []);
          }
          if (factsRes.ok) {
            const data = await factsRes.json();
            setFacts(data.facts || []);
          }
          if (assetsRes.ok) {
            const data = await assetsRes.json();
            setAssets(data.assets || []);
          }
        }
      } catch {
        // Fallback
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Modal Handlers
  function handleOpenCreateGuideline() {
    setModalType('guideline');
    setModalMode('create');
    setEditingId(null);
    setRuleTitle('');
    setRuleType('voice_and_tone');
    setRuleSeverity('medium');
    setRuleDescription('');
    setAllowedExamples('');
    setForbiddenExamples('');
    setRuleKeywords('');
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleOpenEditGuideline(rule: BrandGuideline) {
    setModalType('guideline');
    setModalMode('edit');
    setEditingId(rule.id);
    setRuleTitle(rule.title);
    setRuleType(rule.rule_type);
    setRuleSeverity(rule.severity);
    setRuleDescription(rule.description);
    setAllowedExamples((rule.rule_configuration?.allowed_examples || []).join('\n'));
    setForbiddenExamples((rule.rule_configuration?.forbidden_examples || []).join('\n'));
    setRuleKeywords((rule.rule_configuration?.keywords || []).join(', '));
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleOpenCreateFact() {
    setModalType('fact');
    setModalMode('create');
    setEditingId(null);
    setFactText('');
    setSourceName('');
    setSourceUrl('');
    setEvidenceNotes('');
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleOpenEditFact(fact: ApprovedFact) {
    setModalType('fact');
    setModalMode('edit');
    setEditingId(fact.id);
    setFactText(fact.fact_text);
    setSourceName(fact.source_name);
    setSourceUrl(fact.source_url || '');
    setEvidenceNotes(fact.evidence_notes || '');
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleOpenCreateAsset() {
    setModalType('asset');
    setModalMode('create');
    setEditingId(null);
    setAssetName('');
    setAssetType('logo');
    setAssetFileUrl('');
    setAssetHexColors('#0F766E, #111827, #F8F9FA');
    setAssetNotes('');
    setIsPrimaryAsset(false);
    setModalError(null);
    setIsModalOpen(true);
  }

  async function handleAssetFileUpload(file: File) {
    setIsUploadingAsset(true);
    setModalError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'brand_assets');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload asset file');
      }

      setAssetFileUrl(data.url);
      if (!assetName.trim()) {
        setAssetName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Asset upload failed');
    } finally {
      setIsUploadingAsset(false);
    }
  }

  // Toggle Handlers
  async function handleToggleGuideline(id: string, currentActive: boolean) {
    try {
      const res = await fetch('/api/guidelines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      if (res.ok) {
        setGuidelines((prev) =>
          prev.map((g) => (g.id === id ? { ...g, is_active: !currentActive } : g))
        );
      }
    } catch (err) {
      console.error('Failed to toggle guideline:', err);
    }
  }

  async function handleToggleFact(id: string, currentActive: boolean) {
    try {
      const res = await fetch('/api/facts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });
      if (res.ok) {
        setFacts((prev) =>
          prev.map((f) => (f.id === id ? { ...f, is_active: !currentActive } : f))
        );
      }
    } catch (err) {
      console.error('Failed to toggle fact:', err);
    }
  }

  async function handleToggleAsset(id: string, currentActive: boolean) {
    try {
      const res = await fetch('/api/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'toggle', is_active: !currentActive }),
      });
      if (res.ok) {
        setAssets((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_active: !currentActive } : a))
        );
      }
    } catch (err) {
      console.error('Failed to toggle asset:', err);
    }
  }

  async function handleDeleteAsset(id: string) {
    if (!confirm('Are you sure you want to delete this authorized asset?')) return;
    try {
      const res = await fetch(`/api/assets?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete asset:', err);
    }
  }

  // Modal Submit
  async function handleSubmitModal(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setIsSubmitting(true);

    try {
      if (modalType === 'guideline') {
        const allowedList = allowedExamples.split('\n').map((s) => s.trim()).filter(Boolean);
        const forbiddenList = forbiddenExamples.split('\n').map((s) => s.trim()).filter(Boolean);
        const keywordsList = ruleKeywords.split(',').map((s) => s.trim()).filter(Boolean);

        const payload = {
          title: ruleTitle.trim(),
          description: ruleDescription.trim(),
          rule_type: ruleType,
          severity: ruleSeverity,
          rule_configuration: {
            allowed_examples: allowedList,
            forbidden_examples: forbiddenList,
            keywords: keywordsList,
          },
        };

        const res = await fetch('/api/guidelines', {
          method: modalMode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalMode === 'edit' ? { id: editingId, ...payload } : payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save guideline');
        setIsModalOpen(false);
        await loadData();
      } else if (modalType === 'fact') {
        const payload = {
          fact_text: factText.trim(),
          source_name: sourceName.trim(),
          source_url: sourceUrl.trim() || null,
          evidence_notes: evidenceNotes.trim() || null,
        };

        const res = await fetch('/api/facts', {
          method: modalMode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalMode === 'edit' ? { id: editingId, ...payload } : payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save fact');
        setIsModalOpen(false);
        await loadData();
      } else if (modalType === 'asset') {
        if (!assetName.trim()) throw new Error('Asset name is required');
        if (!assetFileUrl.trim()) throw new Error('Asset file URL or upload is required');

        const hexList = assetHexColors.split(',').map((s) => s.trim()).filter(Boolean);
        const payload = {
          asset_name: assetName.trim(),
          asset_type: assetType,
          file_url: assetFileUrl.trim(),
          asset_metadata: {
            hex_colors: hexList,
            notes: assetNotes.trim(),
            is_primary: isPrimaryAsset,
          },
        };

        const res = await fetch('/api/assets', {
          method: modalMode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modalMode === 'edit' ? { id: editingId, ...payload } : payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save asset');
        setIsModalOpen(false);
        await loadData();
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Setup Workflow Initializer
  async function handleRunSetupWorkflow(e: React.FormEvent) {
    e.preventDefault();
    setSetupErrorMessage(null);
    setSetupSuccessMessage(null);

    const bName = setupBrandName.trim() || 'Acme Enterprise';
    setIsInitializingSetup(true);

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: bName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initialize setup.');

      setSetupSuccessMessage(
        `Brand governance successfully initialized for "${bName}": ${data.guidelinesCreated} brand rules, ${data.factsCreated} verified facts, and ${data.assetsCreated || 3} official visual assets created.`
      );
      setSetupBrandName('');
      await loadData();
    } catch (err: unknown) {
      setSetupErrorMessage(err instanceof Error ? err.message : 'Error executing setup.');
    } finally {
      setIsInitializingSetup(false);
    }
  }

  const sqlSchemaText = `-- ====================================================================
-- BrandGuard AI — Complete Database Schema & Migration Script
-- Supabase PostgreSQL Setup
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. brand_guidelines
CREATE TABLE IF NOT EXISTS brand_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  rule_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. approved_facts
CREATE TABLE IF NOT EXISTS approved_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_text TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  evidence_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. authorized_assets
CREATE TABLE IF NOT EXISTS authorized_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('logo', 'color_palette', 'badge', 'product_image', 'typography')),
  file_url TEXT NOT NULL,
  asset_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. content_reviews
CREATE TABLE IF NOT EXISTS content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  compliance_score NUMERIC(5, 2),
  review_version INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  caption_text TEXT,
  aspect_ratio TEXT,
  image_width INTEGER,
  image_height INTEGER,
  extracted_ocr_text TEXT,
  corrected_image_url TEXT,
  correction_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. review_findings
CREATE TABLE IF NOT EXISTS review_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES content_reviews(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  finding_title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  evidence_text TEXT,
  guideline_id UUID REFERENCES brand_guidelines(id) ON DELETE SET NULL,
  fact_id UUID REFERENCES approved_facts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES authorized_assets(id) ON DELETE SET NULL,
  confidence NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
  suggested_fix TEXT,
  bounding_box JSONB,
  target_type TEXT DEFAULT 'text',
  resolution_status TEXT DEFAULT 'unresolved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. review_decisions
CREATE TABLE IF NOT EXISTS review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES content_reviews(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  reviewer_label TEXT NOT NULL,
  comments TEXT,
  is_override BOOLEAN DEFAULT false,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE brand_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;

-- Read Policies
CREATE POLICY "Allow public read brand_guidelines" ON brand_guidelines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read approved_facts" ON approved_facts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read authorized_assets" ON authorized_assets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read content_reviews" ON content_reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read review_findings" ON review_findings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read review_decisions" ON review_decisions FOR SELECT TO anon, authenticated USING (true);
`;

  function handleCopySql() {
    navigator.clipboard.writeText(sqlSchemaText);
    setSchemaCopied(true);
    setTimeout(() => setSchemaCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Brand Knowledge Management & Standards"
        description="Configure active brand guidelines, verified corporate facts, official logo marks, and visual identity palettes."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              isLoading={isLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-gray-500" />}
            >
              Refresh
            </Button>
            {activeTab === 'guidelines' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateGuideline}
                leftIcon={<Plus className="w-4 h-4 stroke-[2.2]" />}
              >
                Add Guideline
              </Button>
            )}
            {activeTab === 'facts' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateFact}
                leftIcon={<Plus className="w-4 h-4 stroke-[2.2]" />}
              >
                Add Benchmark Fact
              </Button>
            )}
            {activeTab === 'assets' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateAsset}
                leftIcon={<Plus className="w-4 h-4 stroke-[2.2]" />}
              >
                Add Visual Asset
              </Button>
            )}
          </div>
        }
      />

      {/* Workspace Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-2 sm:space-x-4">
          <button
            onClick={() => setActiveTab('guidelines')}
            className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'guidelines'
                ? 'border-teal-800 text-teal-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Brand Guidelines ({guidelines.length})
          </button>
          <button
            onClick={() => setActiveTab('facts')}
            className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'facts'
                ? 'border-teal-800 text-teal-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Approved Facts ({facts.length})
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'assets'
                ? 'border-teal-800 text-teal-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Authorized Visual Assets ({assets.length})
          </button>
          <button
            onClick={() => setActiveTab('setup')}
            className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'setup'
                ? 'border-teal-800 text-teal-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Brand Setup Initializer
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'database'
                ? 'border-teal-800 text-teal-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Audit Storage Schema
          </button>
        </nav>
      </div>

      {/* TAB 1: Brand Guidelines */}
      {activeTab === 'guidelines' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading active guidelines...</p>
            </div>
          ) : guidelines.length === 0 ? (
            <EmptyState
              icon={BookCheck}
              title="No Brand Guidelines Defined"
              description="Create your first brand voice rule, prohibited claim, or mandatory disclaimer to begin enforcing governance standards across marketing posts."
              actionLabel="Add First Guideline"
              onActionClick={handleOpenCreateGuideline}
              secondaryActionLabel="Run Setup Initializer"
              onSecondaryActionClick={() => setActiveTab('setup')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guidelines.map((rule) => {
                const badge = getSeverityBadge(rule.severity);
                return (
                  <Card
                    key={rule.id}
                    className={`bg-white border transition-all shadow-xs ${
                      rule.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60 bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {formatRuleTypeLabel(rule.rule_type)}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleGuideline(rule.id, rule.is_active)}
                          className={`p-1.5 rounded transition-colors ${
                            rule.is_active
                              ? 'text-teal-800 hover:bg-teal-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={rule.is_active ? 'Deactivate rule' : 'Activate rule'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditGuideline(rule)}
                          className="p-1.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                          title="Edit guideline"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="text-sm font-semibold text-gray-900 tracking-tight">
                      {rule.title}
                    </h4>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {rule.description}
                    </p>

                    {/* Keywords / Prohibited Claims */}
                    {rule.rule_configuration?.keywords && rule.rule_configuration.keywords.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                          Prohibited Target Terms
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {rule.rule_configuration.keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Approved Facts */}
      {activeTab === 'facts' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading approved benchmark facts...</p>
            </div>
          ) : facts.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No Benchmark Facts Configured"
              description="Register verified claims, benchmark SLAs, and validated corporate metrics to prevent unsubstantiated assertions in marketing collateral."
              actionLabel="Add Benchmark Fact"
              onActionClick={handleOpenCreateFact}
              secondaryActionLabel="Run Setup Initializer"
              onSecondaryActionClick={() => setActiveTab('setup')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {facts.map((fact) => (
                <Card
                  key={fact.id}
                  className={`bg-white border transition-all shadow-xs ${
                    fact.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Verified Claim
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleFact(fact.id, fact.is_active)}
                        className={`p-1.5 rounded transition-colors ${
                          fact.is_active
                            ? 'text-teal-800 hover:bg-teal-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={fact.is_active ? 'Deactivate fact' : 'Activate fact'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEditFact(fact)}
                        className="p-1.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        title="Edit fact"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-gray-900 leading-snug">
                    &ldquo;{fact.fact_text}&rdquo;
                  </p>

                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-700 truncate max-w-[200px]">
                      Source: {fact.source_name}
                    </span>
                    {fact.source_url && (
                      <a
                        href={fact.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-800 hover:text-teal-950 flex items-center gap-1 text-[11px]"
                      >
                        Documentation <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Authorized Visual Assets (Logos, Colors, Badges) */}
      {activeTab === 'assets' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200/80 text-xs text-teal-950 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-800 shrink-0" />
              <span>
                <strong>Authorized Brand Identity Assets:</strong> Multimodal vision models verify uploaded creative posts against these official logos, palettes, and badges.
              </span>
            </div>
            <Button variant="primary" size="sm" onClick={handleOpenCreateAsset} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Asset
            </Button>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading authorized visual assets...</p>
            </div>
          ) : assets.length === 0 ? (
            <EmptyState
              icon={Palette}
              title="No Authorized Visual Assets Registered"
              description="Upload official brand logos, authorized color palettes, and trust badges so vision models can detect logo distortion, outdated marks, or unapproved palettes."
              actionLabel="Add Official Logo or Palette"
              onActionClick={handleOpenCreateAsset}
              secondaryActionLabel="Run Setup Initializer"
              onSecondaryActionClick={() => setActiveTab('setup')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <Card
                  key={asset.id}
                  className={`bg-white border transition-all shadow-xs ${
                    asset.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                      {asset.asset_type.replace('_', ' ')}
                    </span>
                    {asset.asset_metadata?.is_primary && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Primary Mark
                      </span>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleAsset(asset.id, asset.is_active)}
                        className={`p-1.5 rounded transition-colors ${
                          asset.is_active ? 'text-teal-800 hover:bg-teal-50' : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={asset.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete asset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Asset Visual Preview */}
                  <div className="h-28 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center p-3 mb-3 overflow-hidden">
                    {asset.asset_type === 'color_palette' ? (
                      <div className="flex items-center gap-2">
                        {(asset.asset_metadata?.hex_colors || ['#0F766E', '#111827', '#F8F9FA']).map((hex: string, i: number) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <div
                              className="w-8 h-8 rounded-full border border-gray-300 shadow-xs"
                              style={{ backgroundColor: hex }}
                            />
                            <span className="text-[9px] font-mono text-gray-500">{hex}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.file_url}
                        alt={asset.asset_name}
                        className="max-h-20 max-w-full object-contain"
                      />
                    )}
                  </div>

                  <h4 className="text-sm font-semibold text-gray-900 tracking-tight">
                    {asset.asset_name}
                  </h4>
                  {asset.asset_metadata?.notes && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {asset.asset_metadata.notes}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Setup Workflow */}
      {activeTab === 'setup' && (
        <Card className="bg-white border-gray-200 shadow-xs max-w-2xl mx-auto">
          <CardHeader>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900">
                <Sparkles className="w-4 h-4 text-teal-800" />
                First-Run Brand Governance Initializer
              </CardTitle>
              <CardDescription>
                Quickly populate baseline brand guidelines, factual benchmarks, and authorized visual assets.
              </CardDescription>
            </div>
          </CardHeader>

          <form onSubmit={handleRunSetupWorkflow} className="space-y-4">
            {setupSuccessMessage && (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{setupSuccessMessage}</span>
              </div>
            )}

            {setupErrorMessage && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{setupErrorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Brand or Company Name
              </label>
              <input
                type="text"
                value={setupBrandName}
                onChange={(e) => setSetupBrandName(e.target.value)}
                placeholder="e.g. Acme Enterprise"
                className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700/30"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Defaults to &ldquo;Acme Enterprise&rdquo; if left blank.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 text-xs space-y-1.5 text-gray-600">
              <p className="font-semibold text-gray-800">What will be initialized:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Professional brand tone & anti-hyperbole rules</li>
                <li>Prohibition of absolute guarantees (&ldquo;100% unhackable&rdquo;)</li>
                <li>Mandatory trademark attribution & SLA disclaimer policy</li>
                <li>Social post aspect ratio governance (1:1 Square & 4:5 Portrait)</li>
                <li>Official brand palette (#0F766E Deep Teal, #111827 Charcoal)</li>
                <li>Official vectorized Primary Logo mark & SOC-2 compliance trust badge</li>
                <li>Illustrative 99.9% uptime SLA and security compliance benchmarks</li>
              </ul>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              isLoading={isInitializingSetup}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              Initialize Brand Governance Profile
            </Button>
          </form>
        </Card>
      )}

      {/* TAB 5: Supabase SQL Schema */}
      {activeTab === 'database' && (
        <Card className="bg-white border-gray-200 shadow-xs">
          <CardHeader>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900">
                <Database className="w-4 h-4 text-teal-800" />
                Audit Storage Database Schema & Security Script
              </CardTitle>
              <CardDescription>
                Production schema for brand guidelines, verified facts, authorized assets, image reviews, and decisions
              </CardDescription>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopySql}
              leftIcon={schemaCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {schemaCopied ? 'Copied SQL' : 'Copy SQL Schema'}
            </Button>
          </CardHeader>

          <div className="relative rounded-lg bg-gray-900 p-4 overflow-x-auto max-h-[460px]">
            <pre className="text-xs text-gray-200 font-mono leading-relaxed">
              {sqlSchemaText}
            </pre>
          </div>
        </Card>
      )}

      {/* Modal for Create/Edit Guidelines, Facts, and Assets */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          modalType === 'guideline'
            ? modalMode === 'create'
              ? 'Add Brand Guideline'
              : 'Edit Brand Guideline'
            : modalType === 'fact'
            ? modalMode === 'create'
              ? 'Add Approved Fact'
              : 'Edit Approved Fact'
            : 'Add Authorized Visual Asset'
        }
        description="Configure brand rules, benchmark evidence, or visual reference assets."
      >
        <form onSubmit={handleSubmitModal} className="space-y-4">
          {modalError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {modalError}
            </div>
          )}

          {/* Guideline Fields */}
          {modalType === 'guideline' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder="e.g. Prohibit Unverifiable Absolute Claims"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Rule Type</label>
                  <select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                  >
                    <option value="voice_and_tone">Voice & Tone</option>
                    <option value="prohibited_claim">Prohibited Claim</option>
                    <option value="required_disclaimer">Required Disclaimer</option>
                    <option value="brand_safety">Brand Safety</option>
                    <option value="style_grammar">Style & Grammar</option>
                    <option value="aspect_ratio">Aspect Ratio & Layout</option>
                    <option value="color_palette">Color Palette</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Severity</label>
                  <select
                    value={ruleSeverity}
                    onChange={(e) => setRuleSeverity(e.target.value as RuleSeverity)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical (Blocks Approval)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Policy Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  placeholder="Explain the policy requirement..."
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Prohibited Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={ruleKeywords}
                  onChange={(e) => setRuleKeywords(e.target.value)}
                  placeholder="e.g. 100% secure, unhackable, foolproof"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700 font-mono"
                />
              </div>
            </>
          )}

          {/* Fact Fields */}
          {modalType === 'fact' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Verified Statement / Fact <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={factText}
                  onChange={(e) => setFactText(e.target.value)}
                  placeholder="e.g. Acme Enterprise maintains a documented 99.9% uptime SLA."
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Source / Document Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g. SOC-2 Type II Independent Audit Report 2025"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Source URL (Optional)</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>
            </>
          )}

          {/* Asset Fields */}
          {modalType === 'asset' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Asset Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="e.g. Acme Official Primary Logo"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Asset Type</label>
                  <select
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value as AssetType)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                  >
                    <option value="logo">Official Logo</option>
                    <option value="color_palette">Color Palette</option>
                    <option value="badge">Certification / Trust Badge</option>
                    <option value="product_image">Product Reference Image</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPrimaryAsset}
                      onChange={(e) => setIsPrimaryAsset(e.target.checked)}
                      className="rounded border-gray-300 text-teal-800 focus:ring-teal-700"
                    />
                    <span>Primary Brand Asset</span>
                  </label>
                </div>
              </div>

              {/* File Upload or Path */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Asset File or Resource URL <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={assetFileUrl}
                    onChange={(e) => setAssetFileUrl(e.target.value)}
                    placeholder="/assets/logo-primary.svg or https://..."
                    className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700 font-mono"
                  />
                  <input
                    ref={assetFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleAssetFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    isLoading={isUploadingAsset}
                    onClick={() => assetFileInputRef.current?.click()}
                    leftIcon={<Upload className="w-3.5 h-3.5" />}
                  >
                    Upload
                  </Button>
                </div>
              </div>

              {assetType === 'color_palette' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Brand Hex Colors (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={assetHexColors}
                    onChange={(e) => setAssetHexColors(e.target.value)}
                    placeholder="#0F766E, #111827, #F8F9FA"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  value={assetNotes}
                  onChange={(e) => setAssetNotes(e.target.value)}
                  placeholder="e.g. Required in top-left or bottom-right of creative posts"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-teal-700"
                />
              </div>
            </>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {modalMode === 'create' ? 'Save Asset' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
