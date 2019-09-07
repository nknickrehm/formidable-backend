const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const hummus = require('hummus');
const path = require('path');

const config = require('./config');
const auth = require('./auth');
const User = require('./models/user');
const { Form } = require('./models/form');
const fillForm = require('./pdf-form-fill');
const summarizeForm = require('./controllers/summarizeForm');

const fillPdf = require("fill-pdf");

const router = express.Router();
router.use(auth.init());

/**
 * Login a user.
 *
 * POST /api/v1/login
 * { email, password }
 */
router.post('/login', (req, res, next) => {
  User.findOne({ email: req.body.email }, (err, user) => {
    if (err) {
      next(err);
      return;
    }

    if (!user) {
      res.status(401).json({ err: 'Authentication failed. User not found.' });
      return;
    }

    user.checkPassword(req.body.password, (err2, isMatch) => {
      if (isMatch && !err2) {
        const token = jwt.sign(user.toJSON(), config.secret);
        res.set('Authorization', `Bearer ${token}`).json({ token });
        return;
      }
      res.status(401).json({ err: 'Authentication failed. Wrong password.' });
    });
  });
});

/**
 * Create a new user.
 *
 * POST /api/v1/auth/enroll
 * { email, password, firstName, lastName, institute }
 */
router.post('/enroll', (req, res, next) => {
  const { body } = req;
  const {
    email,
    password,
    firstName,
    lastName,
    institute
  } = body;
  const personalInformation = { firstName, lastName, institute };

  User.findOne({ email })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (user) {
        res.status(400).json({ err: 'User already exists.' });
        return;
      }
      const newUser = new User({ email, password, personalInformation });
      newUser.save((err2, doc) => {
        if (err) {
          next(err2);
          return;
        }
        res.json(doc);
      });
    });
});

/**
 * Get the complete complete user information.
 *
 * GET /api/user
 */
router.get('/user', auth.auth(), (req, res, next) => {
  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) return next(err);
      return res.json(user);
    });
});

/**
 * Get the user profile as a form.
 *
 * GET /user/profile
 */
router.get('/user/profile', auth.auth(), (req, res, next) => {
  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }

      Form.findOne({ type: 'userProfile' })
        .exec((err2, form) => {
          if (err2) {
            next(err2);
            return;
          }

          if (!form) {
            next({ err: 'The form for the user profile is missing in the database.' });
            return;
          }

          const clonedForm = JSON.parse(JSON.stringify(form));
          clonedForm._id = mongoose.Types.ObjectId();

          const userProfile = new Form(clonedForm);

          const { personalInformation } = user;
          const {
            firstName,
            lastName,
            institute,
            position,
            phone
          } = personalInformation;

          userProfile.fields.forEach((field) => {
            switch (field.name) {
              case 'firstName': field.value = firstName; break;
              case 'lastName': field.value = lastName; break;
              case 'institute': field.value = institute; break;
              case 'position': field.value = position; break;
              case 'phone': field.value = phone; break;
              default: field.value = '';
            }
          });

          res.json(userProfile);
        });
    });
});

/**
 * Updates the user profile from a form.
 *
 * PUT /user/profile
 */
router.put('/user/profile', auth.auth(), (req, res, next) => {
  const { body } = req;
  const { form } = body;

  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }

      const { personalInformation } = user;

      form.fields.forEach((field) => {
        switch (field.name) {
          case 'firstName': personalInformation.firstName = field.value; break;
          case 'lastName': personalInformation.lastName = field.value; break;
          case 'institute': personalInformation.institute = field.value; break;
          case 'position': personalInformation.position = field.value; break;
          case 'phone': personalInformation.phone = field.value; break;
          default: break;
        }
      });

      user.save((err2) => {
        if (err2) {
          next(err2);
          return;
        }
        res.json(user);
      });
    });
});

/**
 * Gets all forms for a given user. Output can be shortened by the query ?summarized=...
 *
 * GET /api/user/forms
 * ?summarized=true shortens the output
 */
router.get('/user/forms', auth.auth(), (req, res, next) => {
  User.findOne({ _id: req.user._id })
    .select('-_id forms')
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }

      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }

      let { forms } = user;

      const { query } = req;

      if (query) {
        const { summarized } = query;
        if (summarized) {
          forms = forms.map(summarizeForm);
        }
      }
      res.json(forms);
    });
});

/**
 * Generates a new form.
 *
 * POST /api/user/forms
 * ?summarized=true shortens the output
 */
router.post('/user/forms', auth.auth(), (req, res, next) => {
  const { body } = req;
  const { type } = body;

  if (!type) {
    res.status(400).json({ err: 'Bad boy!' });
    return;
  }

  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }

      Form.findOne({ type })
        .exec((err2, form) => {
          if (err2) {
            next(err2);
            return;
          }

          if (!form) {
            res.status(400).json({ err: 'This type of form does not exist.' });
            return;
          }

          const clonedForm = JSON.parse(JSON.stringify(form));
          clonedForm._id = mongoose.Types.ObjectId();

          const newForm = new Form(clonedForm);

          user.forms.unshift(newForm);
          user.save((err3) => {
            if (err3) {
              next(err3);
              return;
            }
            res.json(user.forms[0]);
          });
        });
    });
});

router.get('/user/forms/:formid', auth.auth(), (req, res, next) => {
  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) return next(err);
      if (!user) return res.status(400).json({ err: 'User does not exist.' });
      let form = user.forms.id(req.params.formid);
      if (!form) return res.status(400).json({ err: 'Form does not exist.' });

      const { query } = req;

      if (query) {
        const { summarized } = query;
        if (summarized) {
          form = summarizeForm(form);
        }
      }
      return res.json(form);
    });
});

router.put('/user/forms/:formid', auth.auth(), (req, res, next) => {
  const { body } = req;
  const { form } = body;

  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }
      const originalForm = user.forms.id(req.params.formid);
      if (!originalForm) {
        res.status(400).json({ err: 'Form does not exist.' });
        return;
      }

      form.isComplete = !form.fields.find(field => !field.isValid);

      originalForm.set(form);
      user.save((err2) => {
        if (err) {
          next(err);
          return;
        }
        res.json(originalForm);
      });
    });
});

router.delete('/user/forms/:formid', auth.auth(), (req, res, next) => {
  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }
      const originalForm = user.forms.id(req.params.formid);
      if (!originalForm) {
        res.status(400).json({ err: 'Form does not exist.' });
        return;
      }

      originalForm.remove();
      user.save((err2) => {
        if (err2) {
          next(err2);
          return;
        }
        res.json(originalForm);
      });
    });
});

router.put('/user/forms/:formid/tag', auth.auth(), (req, res, next) => {
  const { body } = req;
  const { tag } = body;

  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }
      const originalForm = user.forms.id(req.params.formid);
      if (!originalForm) {
        res.status(400).json({ err: 'Form does not exist.' });
        return;
      }

      originalForm.tag = tag;

      user.save((err2) => {
        if (err2) {
          next(err);
          return;
        }
        res.json(originalForm);
      });
    });
});

router.get('/user/forms/:formid/pdf', auth.auth(), (req, res, next) => {
  User.findOne({ _id: req.user._id })
    .exec((err, user) => {
      if (err) {
        next(err);
        console.log(err);
        return;
      }
      if (!user) {
        res.status(400).json({ err: 'User does not exist.' });
        return;
      }

      const form = user.forms.id(req.params.formid);
      if (!form) {
        res.status(400).json({ err: 'Form does not exist.' });
        return;
      }

      const pdfForm = {};

      const textFields = form.fields.filter(field => field.type === 'textField');
      textFields.forEach((field) => {
        if (field.isValid) pdfForm[field.name] = field.value;
      });

      const datePicker = form.fields.filter(field => field.type === 'datePicker');
      datePicker.forEach((field) => {
        if (field.isValid) pdfForm[field.name] = field.value;
      });

      const multiSelects = form.fields.filter(field => field.type === 'multiSelect');
      multiSelects.forEach((field) => {
        field.options.forEach((option) => {
          if (field.isValid) pdfForm[option.name] = option.value;
        });
      });

      const radioGroups = form.fields.filter(field => field.type === 'radioGroup');
      radioGroups.forEach((field) => {
        field.options.forEach((option) => {
          if (field.isValid) pdfForm[`${field.name}${option.name.charAt(0).toUpperCase()}${option.name.slice(1)}`] = field.value === option.name;
        });
      });

      const buttonSelects = form.fields.filter(field => field.type === 'buttonSelect');
      buttonSelects.forEach((field) => {
        field.options.forEach((option) => {
          if (field.isValid) pdfForm[field.name] = field.value;
        });
      });

      pdfForm.businessTrip = true;
      pdfForm.date = `${new Date().getDate()}.${new Date().getMonth() + 1}.${new Date().getFullYear()}`;
      if (user.personalInformation.lastName && user.personalInformation.firstName) {
        pdfForm.name = `${user.personalInformation.lastName}, ${user.personalInformation.firstName}`;
      }
      if (user.personalInformation.institute) {
        pdfForm.institute = user.personalInformation.institute;
      }
      if (user.personalInformation.phone) {
        pdfForm.telephone = user.personalInformation.phone;
      }
      if (user.personalInformation.position === 'graduateStudent') {
        pdfForm.graduateStudent = true;
      } else if (user.personalInformation.position === 'student') {
        pdfForm.student = true;
      } else if (user.personalInformation.position === 'employee') {
        pdfForm.employee = true;
      }

      const sourcePDF = path.join(__dirname, 'public', 'forms', form.pdfFiles[0].url);
      res.writeHead(200, { 'Content-Type': 'application/pdf' });

      const writer = hummus.createWriterToModify(
        new hummus.PDFRStreamForFile(sourcePDF),
        new hummus.PDFStreamForResponse(res)
      );

      form.pdfFiles.shift(1);
      form.pdfFiles.forEach((additionalFile) => {
        let attach = true;

        if (typeof additionalFile.condition !== 'boolean') {
          additionalFile.condition.forEach((condition) => {
            form.fields.forEach((field) => {
              if (field.type === 'multiSelect') {
                field.options.forEach((option) => {
                  if (option.name === condition.field) {
                    if (option.value !== condition.value) attach = false;
                  }
                });
              } else if (field.name === condition.field) {
                if (field.value !== condition.value) attach = false;
              }
            });
          });
        } else attach = additionalFile.condition;

        if (attach) {
          const additionalFilePath = path.join(__dirname, 'public', 'forms', additionalFile.url);
          writer.appendPDFPagesFromPDF(new hummus.PDFRStreamForFile(additionalFilePath));
        }
      });

      fillForm(writer, pdfForm, () => {
        writer.end();
        res.end();
      });
    });
});

module.exports = router;
