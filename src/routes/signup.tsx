const handleSignup = async () => {
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (!error) {
    navigate({ to: "/plans" });
  }
};
   <input />
   <input type="password" />

   <button>
     Create Account
   </button>