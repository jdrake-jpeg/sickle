import { LegalPage } from '@/components/LegalPage';
import legal from '@/constants/legal.json';

// Sickle's terms of use. The text lives in constants/legal.json, which also
// builds the public page at sicklepickle.app/terms (npm run build:site).
export default function TermsScreen() {
  return <LegalPage {...legal.terms} />;
}
