<script>
import { getAuth, signOut } from 'firebase/auth';

export default {
  mounted() {
    const auth = getAuth();
    signOut(auth).then(() => {
      // Sign-out successful
      console.log("LOGOUT");

      // redirect
      this.$router.push('/');
    });
  }
}
</script>
