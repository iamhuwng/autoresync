import './HomeworkScoreDistribution.css';

interface HomeworkScoreDistributionProps {
  scores: number[];
}

const BUCKETS = [
  { key: '0-20', label: '0-20%', min: 0, max: 20 },
  { key: '20-40', label: '20-40%', min: 20, max: 40 },
  { key: '40-60', label: '40-60%', min: 40, max: 60 },
  { key: '60-80', label: '60-80%', min: 60, max: 80 },
  { key: '80-100', label: '80-100%', min: 80, max: 101 },
];

function HomeworkScoreDistribution({ scores }: HomeworkScoreDistributionProps) {
  const bucketCounts = BUCKETS.map((bucket) => ({
    ...bucket,
    count: scores.filter((score) => score >= bucket.min && score < bucket.max).length,
  }));

  const maxCount = Math.max(...bucketCounts.map((bucket) => bucket.count), 0);

  return (
    <div className="homework-score-distribution">
      {bucketCounts.map((bucket) => {
        const height = maxCount > 0 ? Math.max((bucket.count / maxCount) * 80, bucket.count === 0 ? 2 : 10) : 2;

        return (
          <div key={bucket.key} className="homework-score-distribution__bucket">
            <div className="homework-score-distribution__count">{bucket.count}</div>
            <div className="homework-score-distribution__bar-shell">
              <div
                className={`homework-score-distribution__bar ${bucket.count === 0 ? 'empty' : ''}`.trim()}
                style={{ height: `${height}px` }}
              />
            </div>
            <div className="homework-score-distribution__label">{bucket.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default HomeworkScoreDistribution;
