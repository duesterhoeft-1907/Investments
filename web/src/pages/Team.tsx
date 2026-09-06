import { motion } from 'framer-motion';
import { MessageSquare, Route, Timer, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';
import { useSession } from '../lib/session';
import type { DirectoryUser, Team as TeamType } from '../lib/types';
import { Avatar, Button, Card, EmptyState, SectionTitle, Spinner } from '../components/ui';

interface AssetClass {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  team_id: number | null;
  team_name: string | null;
  team_color: string | null;
}

export default function Team() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamType[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [assets, setAssets] = useState<AssetClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const load = useCallback(() => {
    Promise.all([
      api.get<{ teams: TeamType[] }>('/directory/teams'),
      api.get<{ users: DirectoryUser[] }>('/directory/users'),
      api.get<{ assetClasses: AssetClass[] }>('/directory/asset-classes'),
    ])
      .then(([t, u, a]) => {
        setTeams(t.teams);
        setUsers(u.users);
        setAssets(a.assetClasses);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function reroute(assetId: number, teamId: number | null) {
    setSaving(`asset-${assetId}`);
    try {
      await api.patch(`/directory/asset-classes/${assetId}`, { teamId });
      load();
    } finally {
      setSaving('');
    }
  }

  async function setSla(teamId: number, slaMinutes: number) {
    setSaving(`team-${teamId}`);
    try {
      await api.patch(`/directory/teams/${teamId}`, { slaMinutes });
      load();
    } finally {
      setSaving('');
    }
  }

  async function dm(userId: number) {
    const res = await api.post<{ channelId: number }>(`/chat/dm/${userId}`);
    navigate(`/app/chat/${res.channelId}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Team & Routing</h1>
        <p className="mt-1 text-sm text-white/45">
          Fachgebiete steuern, in welche Gruppe eine Anfrage läuft. Die SLA gilt pro Gruppe.
        </p>
      </header>

      {/* ── Routing-Matrix ── */}
      <Card className="p-5">
        <SectionTitle hint={canEdit ? 'änderbar' : 'nur lesend'}>
          <span className="flex items-center gap-2">
            <Route className="size-4 text-gold-400" /> Fachgebiet → Fachgruppe
          </span>
        </SectionTitle>

        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset, i) => (
            <motion.div
              key={asset.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="flex items-center gap-3 rounded-xl border border-white/8 bg-ink-900/40 p-3"
            >
              <span
                className="h-8 w-0.5 shrink-0 rounded-full"
                style={{ background: asset.team_color ?? 'rgba(255,255,255,0.15)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/88">{asset.name}</p>
                <p className="truncate text-[11px] text-white/32">{asset.tagline}</p>
              </div>
              <select
                value={asset.team_id ?? ''}
                disabled={!canEdit || saving === `asset-${asset.id}`}
                onChange={(e) => reroute(asset.id, e.target.value ? Number(e.target.value) : null)}
                className="shrink-0 rounded-lg border border-white/8 bg-ink-900 px-2 py-1.5 text-xs text-white/75 outline-none focus:border-gold-500/50 disabled:opacity-50"
              >
                <option value="">Standard</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* ── Gruppen ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {teams.map((team, i) => (
          <Card key={team.id} className="overflow-hidden" delay={i * 0.06}>
            <div className="border-b border-white/6 p-5" style={{ background: `${team.color}0d` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                    <span className="size-2.5 rounded-full" style={{ background: team.color }} />
                    {team.name}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/45">{team.description}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-white/50">
                  <Users className="size-3.5" /> {team.members.length}
                </span>
                <span className="text-white/50">{team.leadCount} Leads</span>
                {team.awaiting > 0 ? (
                  <span className="text-gold-300">{team.awaiting} offen</span>
                ) : null}
                <span className="ml-auto flex items-center gap-1.5">
                  <Timer className="size-3.5 text-white/35" />
                  {canEdit ? (
                    <select
                      value={team.slaMinutes}
                      disabled={saving === `team-${team.id}`}
                      onChange={(e) => setSla(team.id, Number(e.target.value))}
                      className="rounded-md border border-white/8 bg-ink-900 px-1.5 py-1 text-[11px] text-white/75 outline-none focus:border-gold-500/50"
                    >
                      {[5, 10, 15, 20, 30, 45, 60, 120].map((m) => (
                        <option key={m} value={m}>{m} Min. SLA</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-white/50">{team.slaMinutes} Min. SLA</span>
                  )}
                </span>
              </div>
            </div>

            <div className="p-4">
              {team.members.length === 0 ? (
                <EmptyState title="Keine Mitglieder." />
              ) : (
                <ul className="space-y-1">
                  {team.members.map((member) => {
                    const full = users.find((u) => u.id === member.id);
                    return (
                      <li key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/4">
                        <Avatar name={member.name} accent={member.accent} size={30} online={full?.online} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white/85">{member.name}</p>
                          <p className="truncate text-[11px] text-white/32">
                            {member.title}
                            {full && !full.online && full.lastSeenAt ? ` · zuletzt ${formatRelative(full.lastSeenAt)}` : ''}
                          </p>
                        </div>
                        {member.id !== user?.id ? (
                          <button
                            onClick={() => dm(member.id)}
                            className="shrink-0 text-white/20 transition-colors hover:text-gold-300"
                            aria-label={`Nachricht an ${member.name}`}
                          >
                            <MessageSquare className="size-4" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/6 pt-3">
                {team.assetClasses.map((a) => (
                  <span key={a.id} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-white/45">
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Alle Kolleg:innen ── */}
      <Card className="p-5">
        <SectionTitle hint={`${users.filter((u) => u.online).length} online`}>Alle Kolleginnen und Kollegen</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-ink-900/40 p-3">
              <Avatar name={u.name} accent={u.accent} size={36} online={u.online} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/88">{u.name}</p>
                <p className="truncate text-[11px] text-white/32">{u.title}</p>
              </div>
              {u.id !== user?.id ? (
                <Button size="sm" variant="ghost" onClick={() => dm(u.id)}>
                  <MessageSquare className="size-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
