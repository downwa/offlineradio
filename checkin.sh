for path in *.js *.c *.cc *.h *.hh *.sh *.txt LICENSE README.md Makefile* vars ogglen *.bz2; do git add -v $path; done || true
