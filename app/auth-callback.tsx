import { Redirect } from 'expo-router';

// Google sends players back here after sign-in. The sign-in screen already
// finished the job, so just head into the app.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
