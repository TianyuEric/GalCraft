import { issueDetails, localizeIssue, type Diagnostic } from '@galcraft/contracts';
import { ProductionCode, ProductionDisclosure, productionText } from './ProductionControls.js';

export function ProductionIssue({ issue, locale }: { issue: Diagnostic; locale: string }) {
  const message = localizeIssue(issue, locale), severe = !issue.severity || issue.severity === 'error';
  return <div className="candidate-production-issue" data-severity={issue.severity ?? 'error'}>
    <p role={issue.severity === 'info' ? 'status' : 'alert'}>{message}</p>
    {severe && message !== issue.message && <p>{issue.message}</p>}
    <ProductionDisclosure>
      <span>{productionText(locale, '诊断详情', 'Diagnostic details', '診断の詳細')}</span>
      <ProductionCode code={issueDetails(issue)} language="text" locale={locale}/>
    </ProductionDisclosure>
  </div>;
}
