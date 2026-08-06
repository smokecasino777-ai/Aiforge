import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export async function startGoogleSignIn(): Promise<string | null> {
  try {
    await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });

    const result = await GoogleSignin.signIn();

    const idToken = result.data?.idToken;

    if (!idToken) {
      throw new Error('No Google ID token received');
    }

    const credential = auth.GoogleAuthProvider.credential(idToken);

    const loginResult = await auth().signInWithCredential(
      credential
    );

    const firebaseToken = await loginResult.user.getIdToken();

    return firebaseToken;
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);

    throw new Error(
      error?.message || 'Google sign-in failed'
    );
  }
}

export async function startGitHubSignIn(): Promise<string | null> {
  return null;
}