import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { JOB_STATUS } from '@photo-quest/shared';
import { useJobs } from '../../contexts/JobProgressContext.jsx';
import { pauseJobs, resumeJobs, cancelJob } from '../../utils/api.js';
import { Button, Icon, ProgressBar } from '../ui/index.js';
import { EmptyState } from '../layout/index.js';

const STATUS_LABEL = {
  [JOB_STATUS.PENDING]: 'Queued',
  [JOB_STATUS.RUNNING]: 'Running',
  [JOB_STATUS.PAUSED]: 'Paused',
  [JOB_STATUS.COMPLETED]: 'Done',
  [JOB_STATUS.FAILED]: 'Failed',
};

const STATUS_ORDER = {
  [JOB_STATUS.RUNNING]: 0,
  [JOB_STATUS.PENDING]: 1,
  [JOB_STATUS.PAUSED]: 2,
  [JOB_STATUS.FAILED]: 3,
  [JOB_STATUS.COMPLETED]: 4,
};

export default function TranscodesPage() {
  const jobs = useJobs();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  /* Running first, then queued/paused, newest within each bucket. */
  const sortedJobs = [...jobs].sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.id - a.id
  );

  const hasActive = jobs.some(j => j.status === JOB_STATUS.RUNNING || j.status === JOB_STATUS.PENDING);
  const hasPaused = jobs.some(j => j.status === JOB_STATUS.PAUSED);

  const handlePause = useCallback(async () => {
    setBusy(true);
    try { await pauseJobs(); } catch (err) { console.error('Failed to pause:', err); }
    setBusy(false);
  }, []);

  const handleResume = useCallback(async () => {
    setBusy(true);
    try { await resumeJobs(); } catch (err) { console.error('Failed to resume:', err); }
    setBusy(false);
  }, []);

  const handleCancel = useCallback(async (id) => {
    try { await cancelJob(id); } catch (err) { console.error('Failed to cancel:', err); }
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">Transcodes</h1>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<Icon name="video" className="icon-2xl" />}
          title="No transcodes"
          description="Videos that need conversion will appear here automatically."
        />
      ) : (
        <>
          <div className="transcodes-actions">
            {hasActive && (
              <Button variant="ghost" size="sm" onClick={handlePause} disabled={busy} icon={<Icon name="pause" className="icon-sm" />}>
                Pause all
              </Button>
            )}
            {hasPaused && (
              <Button variant="ghost" size="sm" onClick={handleResume} disabled={busy} icon={<Icon name="next" className="icon-sm" />}>
                Resume all
              </Button>
            )}
          </div>

          <div className="transcodes-list">
            {sortedJobs.map(job => (
              <div key={job.id} className={`transcode-row transcode-row--${job.status}`}>
                <button
                  className="transcode-title"
                  onClick={() => navigate(`/media/${job.media_id}`)}
                >
                  {job.title}
                </button>
                <span className={`transcode-status transcode-status--${job.status}`}>
                  {STATUS_LABEL[job.status] ?? job.status}
                </span>

                {job.status === JOB_STATUS.RUNNING && (
                  <ProgressBar value={job.progress ?? 0} width={20} showPct={false} />
                )}
                {job.status === JOB_STATUS.PENDING && (
                  <ProgressBar width={20} indeterminate showPct={false} />
                )}

                {job.error && (
                  <span className="transcode-error" title={job.error}>{job.error}</span>
                )}

                {job.status !== JOB_STATUS.COMPLETED && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancel(job.id)}
                    icon={<Icon name="close" className="icon-sm" />}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
